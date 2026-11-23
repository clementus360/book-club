-- Club types: book, film, TV series, anime and game clubs.
--
-- The catalogue keeps its name (public.books) because dozens of functions refer
-- to it; each row now says what kind of thing it is. A club takes only its own
-- kind, checked by triggers so every path in (shelf, nomination, recommendation)
-- is covered. Provider records from the new sources are keyed by
-- (metadata_source, external_id).

create type public.club_kind as enum ('book', 'film', 'series', 'anime', 'game');

-- New sources. Not used as literals below, so this is safe inside the migration's
-- transaction.
alter type public.book_source add value if not exists 'tmdb';
alter type public.book_source add value if not exists 'tvmaze';
alter type public.book_source add value if not exists 'anilist';
alter type public.book_source add value if not exists 'igdb';
alter type public.book_source add value if not exists 'rawg';

-- Platform families a game can be played on, and a member can own.
create function private.platforms_ok(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p <@ array['pc', 'mac', 'linux', 'playstation', 'xbox', 'switch', 'ios', 'android']::text[];
$$;

-- ------------------------------------------------------------------- clubs

alter table public.clubs add column kind public.club_kind not null default 'book';

-- A club's kind is fixed once anything belongs to it.
create function private.lock_club_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind is distinct from old.kind and (
    exists (select 1 from public.reading_cycles where club_id = old.id)
    or exists (select 1 from public.club_books where club_id = old.id)
  ) then
    perform private.fail('The kind of club can only change before anything has been added to it.');
  end if;
  return new;
end $$;
create trigger clubs_lock_kind before update of kind on public.clubs
  for each row execute function private.lock_club_kind();

grant update (kind) on public.clubs to authenticated;

drop function public.create_club(text, text, text);
create function public.create_club(
  p_name text, p_description text default null, p_timezone text default 'UTC', p_kind public.club_kind default 'book'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    perform private.fail('Give the club a name of up to 80 characters.');
  end if;
  if not private.allow('create_club', 10, interval '1 day') then
    perform private.fail('You have created several clubs today. Please try again tomorrow.');
  end if;
  insert into public.clubs (name, description, timezone, kind, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_timezone, 'UTC'), coalesce(p_kind, 'book'), auth.uid())
  returning id into new_id;
  insert into public.club_memberships (club_id, user_id, role) values (new_id, auth.uid(), 'admin');
  perform private.record_event(new_id, auth.uid(), 'club_created', new_id, null, false);
  return new_id;
end $$;

-- --------------------------------------------------------------- catalogue

alter table public.books
  add column kind public.club_kind not null default 'book',
  add column external_id text check (char_length(external_id) between 1 and 100),
  add column episodes int check (episodes between 1 and 20000),
  add column runtime_minutes int check (runtime_minutes between 1 and 3000),
  add column play_hours int check (play_hours between 1 and 5000),
  add column platforms text[] not null default '{}' check (private.platforms_ok(platforms));
create unique index books_external_key on public.books (metadata_source, external_id) where external_id is not null;
create index books_kind_idx on public.books (kind);

create function private.kind_of(p_book jsonb) returns public.club_kind
language sql immutable set search_path = '' as $$
  select coalesce(nullif(p_book ->> 'kind', '')::public.club_kind, 'book');
$$;

create function private.platforms_of(p_book jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce((select array_agg(distinct p) from jsonb_array_elements_text(coalesce(p_book -> 'platforms', '[]')) p
                   where private.platforms_ok(array[p])), '{}');
$$;

-- As before for books; records from the film, TV, anime and game sources are
-- matched on their own identifier only.
create or replace function public.import_book(p_book jsonb, p_force_new boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found_id uuid;
  v_src public.book_source := (p_book ->> 'metadata_source')::public.book_source;
  v_kind public.club_kind := private.kind_of(p_book);
  v_ext text := nullif(p_book ->> 'external_id', '');
  v_gid text := nullif(p_book ->> 'google_books_id', '');
  v_eid text := nullif(p_book ->> 'open_library_edition_id', '');
  v_wid text := nullif(p_book ->> 'open_library_work_id', '');
  v_i13 text := nullif(p_book ->> 'isbn_13', '');
  v_i10 text := nullif(p_book ->> 'isbn_10', '');
  v_vol text := private.norm(p_book ->> 'volume_number');
  v_lang text := nullif(p_book ->> 'language', '');
begin
  if v_src::text = 'manual' then perform private.fail('Manual entries use create_manual_book.'); end if;
  if v_kind <> 'book' and v_ext is null then perform private.fail('That record has no identifier.'); end if;

  if v_ext is not null then
    select id into found_id from public.books b where b.metadata_source = v_src and b.external_id = v_ext;
  else
    -- The same provider record is always the same book.
    select id into found_id from public.books b
    where (v_gid is not null and b.google_books_id = v_gid)
       or (v_eid is not null and b.open_library_edition_id = v_eid)
    limit 1;

    -- The same ISBN is the same publication unless the volumes disagree.
    if found_id is null and not p_force_new then
      select id into found_id from public.books b
      where b.metadata_source::text <> 'manual' and b.kind = 'book'
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
      episodes = coalesce(b.episodes, (p_book ->> 'episodes')::int),
      runtime_minutes = coalesce(b.runtime_minutes, (p_book ->> 'runtime_minutes')::int),
      play_hours = coalesce(b.play_hours, (p_book ->> 'play_hours')::int),
      platforms = case when cardinality(b.platforms) = 0 then private.platforms_of(p_book) else b.platforms end,
      metadata_updated_at = now()
    where b.id = found_id and b.metadata_source::text <> 'manual';
    return found_id;
  end if;

  insert into public.books (
    kind, title, original_title, alternative_titles, subtitle, authors, description, cover_url, publisher,
    publication_date, publication_year, language, isbn_10, isbn_13, format, series_title, volume_number,
    page_count, episodes, runtime_minutes, play_hours, platforms,
    open_library_work_id, open_library_edition_id, google_books_id, external_id, metadata_source
  ) values (
    v_kind,
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
    (p_book ->> 'episodes')::int,
    (p_book ->> 'runtime_minutes')::int,
    (p_book ->> 'play_hours')::int,
    private.platforms_of(p_book),
    v_wid, v_eid, v_gid, v_ext, v_src
  ) returning id into found_id;
  return found_id;
exception when unique_violation then
  -- Someone imported the same record at the same moment.
  select id into found_id from public.books b
  where (v_ext is not null and b.metadata_source = v_src and b.external_id = v_ext)
     or (v_gid is not null and b.google_books_id = v_gid)
     or (v_eid is not null and b.open_library_edition_id = v_eid)
  limit 1;
  if found_id is null then raise; end if;
  return found_id;
end $$;

create or replace function private.assert_manual_fields(p_book jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_book ->> 'title', ''))) not between 1 and 500 then
    perform private.fail(case when private.kind_of(p_book) = 'book' then 'A book needs a title.' else 'Please give it a title.' end);
  end if;
  if nullif(p_book ->> 'isbn_13', '') is not null and p_book ->> 'isbn_13' !~ '^[0-9]{13}$' then
    perform private.fail('An ISBN-13 has thirteen digits.');
  end if;
  if nullif(p_book ->> 'isbn_10', '') is not null and p_book ->> 'isbn_10' !~ '^[0-9]{9}[0-9X]$' then
    perform private.fail('That ISBN-10 does not look right.');
  end if;
end $$;

create or replace function public.create_manual_book(p_book jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.assert_manual_fields(p_book);
  if not private.allow('create_manual_book', 60, interval '1 hour') then
    perform private.fail('You have added a lot by hand in the last hour. Please wait a while.');
  end if;
  insert into public.books (
    kind, title, original_title, alternative_titles, subtitle, authors, description, cover_url, publisher,
    publication_date, publication_year, language, isbn_10, isbn_13, format, series_title, volume_number,
    edition_note, page_count, episodes, runtime_minutes, play_hours, platforms, metadata_source
  ) values (
    private.kind_of(p_book),
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
    nullif(btrim(p_book ->> 'edition_note'), ''), (p_book ->> 'page_count')::int,
    (p_book ->> 'episodes')::int, (p_book ->> 'runtime_minutes')::int, (p_book ->> 'play_hours')::int,
    private.platforms_of(p_book), 'manual'
  ) returning id into new_id;
  insert into private.book_origins (book_id, created_by) values (new_id, auth.uid());
  return new_id;
end $$;

-- The kind of a manual entry never changes; everything else can be corrected.
create or replace function public.update_manual_book(p_book_id uuid, p_book jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.books b join private.book_origins o on o.book_id = b.id
    where b.id = p_book_id and b.metadata_source = 'manual' and o.created_by = auth.uid()
  ) then
    perform private.fail('Only the person who entered this can edit its details.');
  end if;
  perform private.assert_manual_fields(p_book || jsonb_build_object('kind', (select kind from public.books where id = p_book_id)));
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
    episodes = (p_book ->> 'episodes')::int,
    runtime_minutes = (p_book ->> 'runtime_minutes')::int,
    play_hours = (p_book ->> 'play_hours')::int,
    platforms = private.platforms_of(p_book),
    metadata_updated_at = now()
  where id = p_book_id;
end $$;

-- Same idea as before, within one kind. A film is never "the same" as a book.
create or replace function public.find_similar_books(p_book jsonb) returns setof public.books
language sql stable security invoker set search_path = '' as $$
  select b.* from public.books b
  where b.kind = private.kind_of(p_book)
    and (
      (nullif(p_book ->> 'isbn_13', '') is not null and b.isbn_13 = p_book ->> 'isbn_13')
      or (nullif(p_book ->> 'isbn_10', '') is not null and b.isbn_10 = p_book ->> 'isbn_10')
      or (nullif(p_book ->> 'open_library_work_id', '') is not null
          and b.open_library_work_id = p_book ->> 'open_library_work_id')
      or (lower(b.title) = private.norm(p_book ->> 'title')
          and (cardinality(b.authors) = 0
               or jsonb_array_length(coalesce(p_book -> 'authors', '[]')) = 0
               or exists (select 1 from jsonb_array_elements_text(p_book -> 'authors') a
                          where private.norm(a) = any (select private.norm(x) from unnest(b.authors) x)))
          and (b.publication_year is null or nullif(p_book ->> 'publication_year', '') is null
               or b.kind = 'book' or b.publication_year = (p_book ->> 'publication_year')::int))
    )
    -- Different volumes are never candidates for each other.
    and (private.norm(b.volume_number) is not distinct from private.norm(p_book ->> 'volume_number'))
  order by b.created_at
  limit 5;
$$;

-- -------------------------------------------------- a club takes its own kind

create function private.assert_kind_fits(p_club uuid, p_book uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_club public.club_kind; v_book public.club_kind;
begin
  select kind into v_club from public.clubs where id = p_club;
  select kind into v_book from public.books where id = p_book;
  if v_club is not null and v_book is not null and v_club <> v_book then
    perform private.fail(case v_club
      when 'book' then 'This is a book club, so only books can be added.'
      when 'film' then 'This is a film club, so only films can be added.'
      when 'series' then 'This is a TV club, so only TV series can be added.'
      when 'anime' then 'This is an anime club, so only anime can be added.'
      when 'game' then 'This is a game club, so only games can be added.'
    end);
  end if;
end $$;

create function private.check_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kind_fits(new.club_id, new.book_id);
  return new;
end $$;
create trigger club_books_kind before insert or update of book_id on public.club_books
  for each row execute function private.check_kind();
create trigger nominations_kind before insert or update of book_id on public.nominations
  for each row execute function private.check_kind();
create trigger club_recommendations_kind before insert or update of book_id on public.club_recommendations
  for each row execute function private.check_kind();

-- ------------------------------------------------------- progress and goals

alter table public.reading_progress
  add column episode int check (episode between 0 and 20000),
  add column hours int check (hours between 0 and 10000);
grant insert (episode, hours), update (episode, hours) on public.reading_progress to authenticated;

-- Where to have got to by the meeting: "Up to episode 6", "Chapter 3".
alter table public.reading_cycles add column goal text check (char_length(goal) <= 200);

create function public.set_cycle_goal(p_cycle_id uuid, p_goal text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status in ('completed', 'cancelled') then perform private.fail('This has already finished.'); end if;
  update public.reading_cycles set goal = nullif(left(btrim(p_goal), 200), '') where id = p_cycle_id;
end $$;

-- ---------------------------------------------------------- your platforms

alter table public.profiles add column platforms text[] not null default '{}' check (private.platforms_ok(platforms));
grant update (platforms) on public.profiles to authenticated;

-- ------------------------------------------------------------------ emails

-- As before, now saying what kind of club it is, so emails use its words.
create or replace function public.claim_emails(p_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  delete from private.email_outbox o using public.profiles p
  where p.id = o.user_id and not p.email_updates and o.sent_at is null;
  update private.email_outbox set failed_at = now(), last_error = coalesce(last_error, 'expired')
  where sent_at is null and failed_at is null and (created_at < now() - interval '2 days' or attempts >= 5);

  select array_agg(notification_id) into v_ids from (
    select notification_id from private.email_outbox
    where sent_at is null and failed_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by created_at limit least(greatest(p_limit, 1), 100)
    for update skip locked) x;
  if v_ids is null then return '[]'::jsonb; end if;
  update private.email_outbox set claimed_at = now(), attempts = attempts + 1 where notification_id = any (v_ids);

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'type', n.type, 'user_id', n.user_id, 'email', u.email, 'name', p.display_name,
      'club_id', c.id, 'club', c.name, 'kind', c.kind, 'timezone', c.timezone, 'actor', a.display_name, 'reference_id', n.reference_id,
      'cycle', (select jsonb_build_object('status', rc.status, 'nomination_closes_at', rc.nomination_closes_at,
                  'voting_closes_at', rc.voting_closes_at, 'runoff_closes_at', rc.runoff_closes_at,
                  'book', b.title, 'authors', b.authors)
                from public.reading_cycles rc left join public.books b on b.id = rc.book_id where rc.id = n.reference_id),
      'meeting', (select jsonb_build_object('title', m.title, 'starts_at', m.starts_at, 'timezone', m.timezone, 'location', m.location)
                  from public.meetings m where m.id = n.reference_id),
      'poll', (select jsonb_build_object('title', mp.title) from public.meeting_polls mp where mp.id = n.reference_id)
    ) order by n.created_at), '[]'::jsonb)
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join auth.users u on u.id = n.user_id
    join public.clubs c on c.id = n.club_id
    left join public.profiles a on a.id = n.actor_id
    where n.id = any (v_ids));
end $$;

-- An invitation says what kind of club it is for, as well as its name.
create or replace function public.preview_invitation(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare inv public.invitations; club_name text; inviter text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into inv from public.invitations where token_hash = private.hash_token(p_token);
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if auth.uid() is not null and private.is_member(inv.club_id) then
    select name into club_name from public.clubs where id = inv.club_id;
    return jsonb_build_object('status', 'already_member', 'club_id', inv.club_id, 'club_name', club_name);
  end if;
  if inv.status = 'accepted' then return jsonb_build_object('status', 'used'); end if;
  if inv.status = 'revoked' then return jsonb_build_object('status', 'revoked'); end if;
  if inv.status = 'expired' or inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  select c.name into club_name from public.clubs c where c.id = inv.club_id;
  select p.display_name into inviter from public.profiles p where p.id = inv.invited_by;
  return jsonb_build_object('status', 'pending', 'club_name', club_name,
                            'club_kind', (select c.kind from public.clubs c where c.id = inv.club_id),
                            'invited_by', inviter, 'expires_at', inv.expires_at);
end $$;

-- ------------------------------------------------------------------ grants

revoke execute on function
  private.platforms_ok(text[]), private.lock_club_kind(), private.kind_of(jsonb), private.platforms_of(jsonb),
  private.assert_kind_fits(uuid, uuid), private.check_kind(),
  public.create_club(text, text, text, public.club_kind), public.set_cycle_goal(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.create_club(text, text, text, public.club_kind), public.set_cycle_goal(uuid, text)
  to authenticated;
-- Evaluated as the caller: by the check constraints, and by find_similar_books.
grant execute on function private.platforms_ok(text[]), private.kind_of(jsonb) to authenticated;
