-- Commonplace 2/6: shared book catalogue and private personal libraries.

create type public.book_format as enum (
  'novel', 'nonfiction', 'short_stories', 'poetry', 'drama', 'manga', 'manhua',
  'manhwa', 'light_novel', 'graphic_novel', 'comic', 'other'
);
create type public.book_source as enum ('open_library', 'google_books', 'manual');
create type public.reading_status as enum ('read', 'currently_reading', 'want_to_read');

-- One row is one publication as a reader would pick it: a particular work,
-- edition or volume. Provider identifiers are matching signals, never the key.
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  original_title text check (char_length(original_title) <= 500),
  alternative_titles text[] not null default '{}',
  subtitle text check (char_length(subtitle) <= 500),
  authors text[] not null default '{}',
  description text check (char_length(description) <= 10000),
  cover_url text check (cover_url ~ '^https://' and char_length(cover_url) <= 1000),
  publisher text check (char_length(publisher) <= 300),
  publication_date text check (char_length(publication_date) <= 60),
  publication_year int check (publication_year between -3000 and 2200),
  language text check (char_length(language) <= 20),
  isbn_10 text check (isbn_10 ~ '^[0-9]{9}[0-9X]$'),
  isbn_13 text check (isbn_13 ~ '^[0-9]{13}$'),
  format public.book_format,
  series_title text check (char_length(series_title) <= 300),
  volume_number text check (char_length(volume_number) <= 20),
  edition_note text check (char_length(edition_note) <= 200),
  page_count int check (page_count between 1 and 50000),
  open_library_work_id text,
  open_library_edition_id text,
  google_books_id text,
  metadata_source public.book_source not null,
  metadata_updated_at timestamptz not null default now(),
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index books_google_key on public.books (google_books_id) where google_books_id is not null;
create unique index books_ol_edition_key on public.books (open_library_edition_id) where open_library_edition_id is not null;
create index books_ol_work_idx on public.books (open_library_work_id);
create index books_isbn13_idx on public.books (isbn_13);
create index books_title_idx on public.books (lower(title));

create function private.books_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.search_text := lower(concat_ws(' ', new.title, new.original_title, new.subtitle,
    array_to_string(new.alternative_titles, ' '), array_to_string(new.authors, ' '),
    new.series_title, new.isbn_10, new.isbn_13));
  return new;
end $$;
create trigger books_before_write before insert or update on public.books
  for each row execute function private.books_before_write();

-- Who typed in a manual entry. Kept out of the API so the catalogue never
-- discloses who reads what.
create table private.book_origins (
  book_id uuid primary key references public.books (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade
);

alter table public.activity_events
  add foreign key (book_id) references public.books (id) on delete cascade;

-- ---------------------------------------------------------- personal library

create table public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  status public.reading_status not null default 'want_to_read',
  date_started date,
  date_finished date,
  is_favourite boolean not null default false,
  private_notes text check (char_length(private_notes) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id),
  check (date_finished >= date_started)
);
create index user_books_book_idx on public.user_books (book_id);
create trigger user_books_touch before update on public.user_books
  for each row execute function private.touch_updated_at();

-- Tied to the library entry: removing the entry removes its private review.
create table public.personal_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  book_id uuid not null,
  rating smallint check (rating between 1 and 5),
  review_text text check (char_length(review_text) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id),
  foreign key (user_id, book_id) references public.user_books (user_id, book_id) on delete cascade,
  check (rating is not null or btrim(review_text) <> '')
);
create trigger personal_reviews_touch before update on public.personal_reviews
  for each row execute function private.touch_updated_at();

-- ------------------------------------------------------------------ catalogue

create function private.norm(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '');
$$;

-- Adds a provider record to the catalogue, or returns the existing one when a
-- strong signal matches. Called only by the server (service_role) with records
-- it fetched itself, so one person cannot plant false metadata for everyone.
create function public.import_book(p_book jsonb, p_force_new boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found_id uuid;
  v_src public.book_source := (p_book ->> 'metadata_source')::public.book_source;
  v_gid text := nullif(p_book ->> 'google_books_id', '');
  v_eid text := nullif(p_book ->> 'open_library_edition_id', '');
  v_wid text := nullif(p_book ->> 'open_library_work_id', '');
  v_i13 text := nullif(p_book ->> 'isbn_13', '');
  v_i10 text := nullif(p_book ->> 'isbn_10', '');
  v_vol text := private.norm(p_book ->> 'volume_number');
  v_lang text := nullif(p_book ->> 'language', '');
begin
  if v_src = 'manual' then perform private.fail('Manual entries use create_manual_book.'); end if;

  -- The same provider record is always the same book.
  select id into found_id from public.books b
  where (v_gid is not null and b.google_books_id = v_gid)
     or (v_eid is not null and b.open_library_edition_id = v_eid)
  limit 1;

  -- The same ISBN is the same publication unless the volumes disagree.
  if found_id is null and not p_force_new then
    select id into found_id from public.books b
    where b.metadata_source <> 'manual'
      and ((v_i13 is not null and b.isbn_13 = v_i13) or (v_i10 is not null and b.isbn_10 = v_i10))
      and (v_vol is null or b.volume_number is null or private.norm(b.volume_number) = v_vol)
    order by b.created_at limit 1;
  end if;

  -- A bare work (no edition chosen) matches another bare record of that work.
  if found_id is null and not p_force_new and v_wid is not null and v_eid is null then
    select id into found_id from public.books b
    where b.open_library_work_id = v_wid and b.open_library_edition_id is null
      and private.norm(b.volume_number) is not distinct from v_vol
      and b.language is not distinct from v_lang
    order by b.created_at limit 1;
  end if;

  if found_id is not null then
    -- Fill gaps, never overwrite what people already see.
    update public.books b set
      google_books_id = coalesce(b.google_books_id,
        case when not exists (select 1 from public.books x where x.google_books_id = v_gid) then v_gid end),
      open_library_edition_id = coalesce(b.open_library_edition_id,
        case when not exists (select 1 from public.books x where x.open_library_edition_id = v_eid) then v_eid end),
      open_library_work_id = coalesce(b.open_library_work_id, v_wid),
      cover_url = coalesce(b.cover_url, nullif(p_book ->> 'cover_url', '')),
      description = coalesce(b.description, nullif(left(p_book ->> 'description', 10000), '')),
      page_count = coalesce(b.page_count, (p_book ->> 'page_count')::int),
      metadata_updated_at = now()
    where b.id = found_id and b.metadata_source <> 'manual';
    return found_id;
  end if;

  insert into public.books (
    title, original_title, alternative_titles, subtitle, authors, description, cover_url, publisher,
    publication_date, publication_year, language, isbn_10, isbn_13, format, series_title, volume_number,
    page_count, open_library_work_id, open_library_edition_id, google_books_id, metadata_source
  ) values (
    left(btrim(p_book ->> 'title'), 500),
    nullif(left(p_book ->> 'original_title', 500), ''),
    coalesce((select array_agg(left(t, 500)) from jsonb_array_elements_text(p_book -> 'alternative_titles') t), '{}'),
    nullif(left(p_book ->> 'subtitle', 500), ''),
    coalesce((select array_agg(left(a, 200)) from jsonb_array_elements_text(p_book -> 'authors') a), '{}'),
    nullif(left(p_book ->> 'description', 10000), ''),
    nullif(p_book ->> 'cover_url', ''),
    nullif(left(p_book ->> 'publisher', 300), ''),
    nullif(left(p_book ->> 'publication_date', 60), ''),
    (p_book ->> 'publication_year')::int,
    v_lang, v_i10, v_i13,
    (nullif(p_book ->> 'format', ''))::public.book_format,
    nullif(left(p_book ->> 'series_title', 300), ''),
    nullif(left(p_book ->> 'volume_number', 20), ''),
    (p_book ->> 'page_count')::int,
    v_wid, v_eid, v_gid, v_src
  ) returning id into found_id;
  return found_id;
exception when unique_violation then
  -- Someone imported the same record at the same moment.
  select id into found_id from public.books b
  where (v_gid is not null and b.google_books_id = v_gid)
     or (v_eid is not null and b.open_library_edition_id = v_eid)
  limit 1;
  if found_id is null then raise; end if;
  return found_id;
end $$;

create function private.book_in_my_clubs(p_book uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  -- plpgsql, so club_books (next migration) is resolved when called.
  return exists (
    select 1 from public.club_books cb
    join public.club_memberships m on m.club_id = cb.club_id
    where cb.book_id = p_book and m.user_id = auth.uid()
  );
end $$;

create function private.manual_book_visible(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.book_origins o where o.book_id = p_book and o.created_by = auth.uid())
      or exists (select 1 from public.user_books ub where ub.book_id = p_book and ub.user_id = auth.uid())
      or private.book_in_my_clubs(p_book);
$$;

create function private.assert_book_visible(p_book uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.books b
    where b.id = p_book and (b.metadata_source <> 'manual' or private.manual_book_visible(b.id))
  ) then
    perform private.fail('That book could not be found.');
  end if;
end $$;

create function private.assert_manual_fields(p_book jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_book ->> 'title', ''))) not between 1 and 500 then
    perform private.fail('A book needs a title.');
  end if;
  if nullif(p_book ->> 'isbn_13', '') is not null and p_book ->> 'isbn_13' !~ '^[0-9]{13}$' then
    perform private.fail('An ISBN-13 has thirteen digits.');
  end if;
  if nullif(p_book ->> 'isbn_10', '') is not null and p_book ->> 'isbn_10' !~ '^[0-9]{9}[0-9X]$' then
    perform private.fail('That ISBN-10 does not look right.');
  end if;
end $$;

create function public.create_manual_book(p_book jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.assert_manual_fields(p_book);
  if not private.allow('create_manual_book', 60, interval '1 hour') then
    perform private.fail('You have added a lot of books in the last hour. Please wait a while.');
  end if;
  insert into public.books (
    title, original_title, alternative_titles, subtitle, authors, description, cover_url, publisher,
    publication_date, publication_year, language, isbn_10, isbn_13, format, series_title, volume_number,
    edition_note, page_count, metadata_source
  ) values (
    btrim(p_book ->> 'title'), nullif(btrim(p_book ->> 'original_title'), ''),
    coalesce((select array_agg(t) from jsonb_array_elements_text(p_book -> 'alternative_titles') t), '{}'),
    nullif(btrim(p_book ->> 'subtitle'), ''),
    coalesce((select array_agg(a) from jsonb_array_elements_text(p_book -> 'authors') a), '{}'),
    nullif(btrim(p_book ->> 'description'), ''), nullif(p_book ->> 'cover_url', ''),
    nullif(btrim(p_book ->> 'publisher'), ''), nullif(p_book ->> 'publication_date', ''),
    (p_book ->> 'publication_year')::int, nullif(p_book ->> 'language', ''),
    nullif(p_book ->> 'isbn_10', ''), nullif(p_book ->> 'isbn_13', ''),
    (nullif(p_book ->> 'format', ''))::public.book_format,
    nullif(btrim(p_book ->> 'series_title'), ''), nullif(btrim(p_book ->> 'volume_number'), ''),
    nullif(btrim(p_book ->> 'edition_note'), ''), (p_book ->> 'page_count')::int, 'manual'
  ) returning id into new_id;
  insert into private.book_origins (book_id, created_by) values (new_id, auth.uid());
  return new_id;
end $$;

create function public.update_manual_book(p_book_id uuid, p_book jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.books b join private.book_origins o on o.book_id = b.id
    where b.id = p_book_id and b.metadata_source = 'manual' and o.created_by = auth.uid()
  ) then
    perform private.fail('Only the person who entered this book can edit its details.');
  end if;
  perform private.assert_manual_fields(p_book);
  update public.books set
    title = btrim(p_book ->> 'title'),
    original_title = nullif(btrim(p_book ->> 'original_title'), ''),
    subtitle = nullif(btrim(p_book ->> 'subtitle'), ''),
    authors = coalesce((select array_agg(a) from jsonb_array_elements_text(p_book -> 'authors') a), '{}'),
    description = nullif(btrim(p_book ->> 'description'), ''),
    cover_url = nullif(p_book ->> 'cover_url', ''),
    publisher = nullif(btrim(p_book ->> 'publisher'), ''),
    publication_year = (p_book ->> 'publication_year')::int,
    language = nullif(p_book ->> 'language', ''),
    isbn_10 = nullif(p_book ->> 'isbn_10', ''),
    isbn_13 = nullif(p_book ->> 'isbn_13', ''),
    format = (nullif(p_book ->> 'format', ''))::public.book_format,
    series_title = nullif(btrim(p_book ->> 'series_title'), ''),
    volume_number = nullif(btrim(p_book ->> 'volume_number'), ''),
    edition_note = nullif(btrim(p_book ->> 'edition_note'), ''),
    page_count = (p_book ->> 'page_count')::int,
    metadata_updated_at = now()
  where id = p_book_id;
end $$;

create function public.can_edit_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.books b join private.book_origins o on o.book_id = b.id
    where b.id = p_book_id and b.metadata_source = 'manual' and o.created_by = auth.uid()
  );
$$;

-- Books that might be the same publication. Never merges anything: the reader
-- decides. Runs as the caller, so RLS hides other people's manual entries.
create function public.find_similar_books(p_book jsonb) returns setof public.books
language sql stable security invoker set search_path = '' as $$
  select b.* from public.books b
  where (
      (nullif(p_book ->> 'isbn_13', '') is not null and b.isbn_13 = p_book ->> 'isbn_13')
      or (nullif(p_book ->> 'isbn_10', '') is not null and b.isbn_10 = p_book ->> 'isbn_10')
      or (nullif(p_book ->> 'open_library_work_id', '') is not null
          and b.open_library_work_id = p_book ->> 'open_library_work_id')
      or (lower(b.title) = private.norm(p_book ->> 'title')
          and (cardinality(b.authors) = 0
               or jsonb_array_length(coalesce(p_book -> 'authors', '[]')) = 0
               or exists (select 1 from jsonb_array_elements_text(p_book -> 'authors') a
                          where private.norm(a) = any (select private.norm(x) from unnest(b.authors) x))))
    )
    -- Different volumes are never candidates for each other.
    and (private.norm(b.volume_number) is not distinct from private.norm(p_book ->> 'volume_number'))
  order by b.created_at
  limit 5;
$$;

create function public.consume_search_quota() returns boolean
language sql security definer set search_path = '' as $$
  select private.allow('book_search', 60, interval '5 minutes');
$$;

-- ---------------------------------------------------------------------- RLS

alter table public.books enable row level security;
alter table public.user_books enable row level security;
alter table public.personal_reviews enable row level security;

create policy "read the catalogue" on public.books for select to authenticated
  using (metadata_source <> 'manual' or private.manual_book_visible(id));

create policy "own library: read" on public.user_books for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own library: add" on public.user_books for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.books b where b.id = book_id));
create policy "own library: edit" on public.user_books for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own library: remove" on public.user_books for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "own reviews: read" on public.personal_reviews for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own reviews: write" on public.personal_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own reviews: edit" on public.personal_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own reviews: remove" on public.personal_reviews for delete to authenticated
  using (user_id = (select auth.uid()));
