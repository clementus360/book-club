-- Commonplace 3/6: club libraries and recommendations.
-- Recommending is informal. Nothing here touches nominations or votes.

create type public.club_book_source as enum ('added', 'recommended', 'nominated');

create table public.club_books (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  added_by uuid references public.profiles (id) on delete set null,
  source public.club_book_source not null default 'added',
  added_at timestamptz not null default now(),
  unique (club_id, book_id)
);
create index club_books_book_idx on public.club_books (book_id);

create table public.club_recommendations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete restrict,
  recommended_by uuid references public.profiles (id) on delete set null,
  recommendation_text text check (char_length(recommendation_text) <= 4000),
  -- Deliberate snapshots. No foreign key to personal_reviews on purpose.
  shared_rating smallint check (shared_rating between 1 and 5),
  shared_review_text text check (char_length(shared_review_text) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id) on delete set null
);
create unique index club_recommendations_one_active
  on public.club_recommendations (club_id, book_id, recommended_by) where withdrawn_at is null;
create index club_recommendations_club_idx on public.club_recommendations (club_id, created_at desc);
create index club_recommendations_by_idx on public.club_recommendations (recommended_by);
create trigger club_recommendations_touch before update on public.club_recommendations
  for each row execute function private.touch_updated_at();

create function private.ensure_club_book(p_club uuid, p_book uuid, p_user uuid, p_source public.club_book_source)
returns void
language sql security definer set search_path = '' as $$
  insert into public.club_books (club_id, book_id, added_by, source)
  values (p_club, p_book, p_user, p_source)
  on conflict (club_id, book_id) do nothing;
$$;

create function public.add_club_book(p_club_id uuid, p_book_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_member(p_club_id);
  perform private.assert_book_visible(p_book_id);
  insert into public.club_books (club_id, book_id, added_by) values (p_club_id, p_book_id, auth.uid())
  on conflict (club_id, book_id) do nothing;
  if not found then perform private.fail('That book is already in the club library.'); end if;
  perform private.record_event(p_club_id, auth.uid(), 'book_added', p_book_id, p_book_id, false);
end $$;

-- Only books with no history in the club can be taken off its shelves.
create function public.remove_club_book(p_club_id uuid, p_book_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cb public.club_books;
begin
  perform private.assert_member(p_club_id);
  select * into cb from public.club_books where club_id = p_club_id and book_id = p_book_id for update;
  if not found then perform private.fail('That book is not in the club library.'); end if;
  if cb.added_by is distinct from auth.uid() and not private.is_admin(p_club_id) then
    perform private.fail('Only the person who added this book, or an administrator, can remove it.');
  end if;
  if exists (select 1 from public.nominations where club_id = p_club_id and book_id = p_book_id)
     or exists (select 1 from public.reading_cycles where club_id = p_club_id and book_id = p_book_id)
     or exists (select 1 from public.club_recommendations
                where club_id = p_club_id and book_id = p_book_id and withdrawn_at is null) then
    perform private.fail('This book is part of the club''s history, so it stays in the library.');
  end if;
  delete from public.club_books where id = cb.id;
  delete from public.activity_events
  where club_id = p_club_id and type = 'book_added' and book_id = p_book_id;
end $$;

-- The rating is copied from the caller's own review on the server; the review
-- text is whatever the caller chose to share, possibly edited.
create function public.recommend_book(
  p_club_id uuid, p_book_id uuid, p_text text default null,
  p_share_rating boolean default false, p_shared_review text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; v_rating smallint;
begin
  perform private.assert_member(p_club_id);
  if not exists (select 1 from public.user_books where user_id = auth.uid() and book_id = p_book_id) then
    perform private.fail('Add the book to your own library before recommending it.');
  end if;
  if char_length(p_text) > 4000 or char_length(p_shared_review) > 20000 then
    perform private.fail('That text is too long.');
  end if;
  if not private.allow('recommend', 60, interval '1 hour') then
    perform private.fail('You have made a lot of recommendations in the last hour. Please wait a while.');
  end if;
  if p_share_rating then
    select rating into v_rating from public.personal_reviews
    where user_id = auth.uid() and book_id = p_book_id;
  end if;
  begin
    insert into public.club_recommendations
      (club_id, book_id, recommended_by, recommendation_text, shared_rating, shared_review_text)
    values (p_club_id, p_book_id, auth.uid(), nullif(btrim(p_text), ''), v_rating, nullif(btrim(p_shared_review), ''))
    returning id into new_id;
  exception when unique_violation then
    perform private.fail('You have already recommended this book to that club. You can edit that recommendation instead.');
  end;
  perform private.ensure_club_book(p_club_id, p_book_id, auth.uid(), 'recommended');
  perform private.record_event(p_club_id, auth.uid(), 'recommendation_shared', new_id, p_book_id);
  return new_id;
end $$;

-- p_rating_mode: 'keep' the snapshot, 'update' it from the current review, or 'remove' it.
create function public.edit_recommendation(
  p_id uuid, p_text text, p_rating_mode text, p_shared_review text
) returns void
language plpgsql security definer set search_path = '' as $$
declare rec public.club_recommendations; v_rating smallint;
begin
  select * into rec from public.club_recommendations where id = p_id and withdrawn_at is null for update;
  if not found or rec.recommended_by is distinct from auth.uid() then
    perform private.fail('That recommendation could not be found.');
  end if;
  perform private.assert_member(rec.club_id);
  if p_rating_mode = 'keep' then v_rating := rec.shared_rating;
  elsif p_rating_mode = 'update' then
    select rating into v_rating from public.personal_reviews
    where user_id = auth.uid() and book_id = rec.book_id;
  elsif p_rating_mode = 'remove' then v_rating := null;
  else perform private.fail('Choose what to do with the rating.');
  end if;
  update public.club_recommendations set
    recommendation_text = nullif(btrim(p_text), ''),
    shared_rating = v_rating,
    shared_review_text = nullif(btrim(p_shared_review), '')
  where id = p_id;
end $$;

-- The recommender may withdraw at any time, even after leaving the club.
create function public.withdraw_recommendation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare rec public.club_recommendations;
begin
  select * into rec from public.club_recommendations where id = p_id and withdrawn_at is null for update;
  if not found or (rec.recommended_by is distinct from auth.uid() and not private.is_admin(rec.club_id)) then
    perform private.fail('That recommendation could not be found.');
  end if;
  update public.club_recommendations set withdrawn_at = now(), withdrawn_by = auth.uid() where id = p_id;
  delete from public.notifications where reference_id = p_id;
  delete from public.activity_events where reference_id = p_id;
end $$;

alter table public.club_books enable row level security;
alter table public.club_recommendations enable row level security;

create policy "members read the club library" on public.club_books for select to authenticated
  using (private.is_member(club_id));
-- Once withdrawn, only its author can still see it.
create policy "members read live recommendations" on public.club_recommendations for select to authenticated
  using ((withdrawn_at is null and private.is_member(club_id)) or recommended_by = (select auth.uid()));
