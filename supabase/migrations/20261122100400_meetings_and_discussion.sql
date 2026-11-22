-- Commonplace 5/6: meetings, attendance, discussion records, club reviews.

create type public.meeting_status as enum ('scheduled', 'completed', 'cancelled');
create type public.attendance_status as enum ('going', 'maybe', 'not_going');
create type public.note_kind as enum ('note', 'quotation');

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  cycle_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (char_length(description) <= 4000),
  starts_at timestamptz not null,
  timezone text not null,
  location text check (char_length(location) <= 500),
  agenda text check (char_length(agenda) <= 8000),
  outcomes text check (char_length(outcomes) <= 20000),
  discussion_leader_id uuid references public.profiles (id) on delete set null,
  status public.meeting_status not null default 'scheduled',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id)
);
create index meetings_club_idx on public.meetings (club_id, starts_at);
create index meetings_cycle_idx on public.meetings (cycle_id);
create trigger meetings_touch before update on public.meetings
  for each row execute function private.touch_updated_at();
create trigger meetings_timezone before insert or update on public.meetings
  for each row execute function private.check_timezone();

create function private.check_meeting_leader() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.discussion_leader_id is not null
     and (tg_op = 'INSERT' or new.discussion_leader_id is distinct from old.discussion_leader_id)
     and not private.is_member_user(new.club_id, new.discussion_leader_id) then
    perform private.fail('The discussion leader must be a member of this club.');
  end if;
  return new;
end $$;
create trigger meetings_leader before insert or update on public.meetings
  for each row execute function private.check_meeting_leader();

create function private.announce_meeting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.record_event(new.club_id, auth.uid(), 'meeting_created', new.id);
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    perform private.record_event(new.club_id, auth.uid(), 'meeting_cancelled', new.id);
  elsif new.status = 'scheduled' and (old.status <> 'scheduled' or new.starts_at <> old.starts_at
        or new.location is distinct from old.location) then
    perform private.record_event(new.club_id, auth.uid(), 'meeting_updated', new.id);
  end if;
  return null;
end $$;
create trigger meetings_announce after insert or update on public.meetings
  for each row execute function private.announce_meeting();

create table public.meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  attendance_status public.attendance_status not null,
  updated_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);
create trigger meeting_attendees_touch before update on public.meeting_attendees
  for each row execute function private.touch_updated_at();

-- Administrators and the discussion leader write up a meeting.
create function public.record_meeting_outcomes(p_meeting_id uuid, p_outcomes text, p_completed boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id = p_meeting_id for update;
  if not found or not private.is_member(m.club_id) then
    perform private.fail('That meeting could not be found.');
  end if;
  if not (private.is_admin(m.club_id) or m.discussion_leader_id is not distinct from auth.uid()) then
    perform private.fail('Only an administrator or the discussion leader can write up this meeting.');
  end if;
  if m.status = 'cancelled' then perform private.fail('This meeting was cancelled.'); end if;
  update public.meetings set
    outcomes = nullif(btrim(p_outcomes), ''),
    status = case when p_completed then 'completed' else status end::public.meeting_status
  where id = p_meeting_id;
end $$;

-- ------------------------------------------------------------- discussion

create table public.discussion_questions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  cycle_id uuid not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  question text not null check (char_length(btrim(question)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade
);
create index discussion_questions_cycle_idx on public.discussion_questions (cycle_id);

create table public.discussion_notes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  cycle_id uuid,
  meeting_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  kind public.note_kind not null default 'note',
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  source text check (char_length(source) <= 200), -- e.g. "p. 112" or "chapter 4"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cycle_id is not null or meeting_id is not null),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade,
  foreign key (meeting_id, club_id) references public.meetings (id, club_id) on delete cascade
);
create index discussion_notes_cycle_idx on public.discussion_notes (cycle_id);
create index discussion_notes_meeting_idx on public.discussion_notes (meeting_id);
create trigger discussion_notes_touch before update on public.discussion_notes
  for each row execute function private.touch_updated_at();

-- One review per member per cycle, written for the club. Separate from
-- personal_reviews in every respect.
create table public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  cycle_id uuid not null,
  book_id uuid not null references public.books (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  rating smallint check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, created_by),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade
);
create trigger book_reviews_touch before update on public.book_reviews
  for each row execute function private.touch_updated_at();

create function public.save_club_review(p_cycle_id uuid, p_rating smallint, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, false);
  if c.status not in ('reading', 'completed') then
    perform private.fail('A club review can be written once the club is reading the book.');
  end if;
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 20000 then
    perform private.fail('Write something for the review.');
  end if;
  insert into public.book_reviews (club_id, cycle_id, book_id, created_by, rating, review_text)
  values (c.club_id, c.id, c.book_id, auth.uid(), p_rating, btrim(p_text))
  on conflict (cycle_id, created_by) do update set rating = excluded.rating, review_text = excluded.review_text;
end $$;

-- ---------------------------------------------------------------------- RLS

create function private.can_attend(p_meeting uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meetings m
    join public.club_memberships cm on cm.club_id = m.club_id
    where m.id = p_meeting and cm.user_id = auth.uid() and m.status = 'scheduled');
$$;
create function private.is_meeting_member(p_meeting uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meetings m
    join public.club_memberships cm on cm.club_id = m.club_id
    where m.id = p_meeting and cm.user_id = auth.uid());
$$;

alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.discussion_questions enable row level security;
alter table public.discussion_notes enable row level security;
alter table public.book_reviews enable row level security;

create policy "members see meetings" on public.meetings for select to authenticated
  using (private.is_member(club_id));
create policy "admins create meetings" on public.meetings for insert to authenticated
  with check (private.is_admin(club_id) and created_by = (select auth.uid()));
create policy "admins edit meetings" on public.meetings for update to authenticated
  using (private.is_admin(club_id)) with check (private.is_admin(club_id));

create policy "members see attendance" on public.meeting_attendees for select to authenticated
  using (private.is_meeting_member(meeting_id));
create policy "answer for yourself" on public.meeting_attendees for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_attend(meeting_id));
create policy "change your own answer" on public.meeting_attendees for update to authenticated
  using (user_id = (select auth.uid()) and private.can_attend(meeting_id))
  with check (user_id = (select auth.uid()) and private.can_attend(meeting_id));

create policy "members read questions" on public.discussion_questions for select to authenticated
  using (private.is_member(club_id));
create policy "members ask questions" on public.discussion_questions for insert to authenticated
  with check (private.is_member(club_id) and created_by = (select auth.uid()));
create policy "edit own questions" on public.discussion_questions for update to authenticated
  using (private.is_member(club_id) and created_by = (select auth.uid()))
  with check (private.is_member(club_id) and created_by = (select auth.uid()));
create policy "remove own questions, or as admin" on public.discussion_questions for delete to authenticated
  using (private.is_member(club_id) and (created_by = (select auth.uid()) or private.is_admin(club_id)));

create policy "members read notes" on public.discussion_notes for select to authenticated
  using (private.is_member(club_id));
create policy "members write notes" on public.discussion_notes for insert to authenticated
  with check (private.is_member(club_id) and created_by = (select auth.uid()));
create policy "edit own notes" on public.discussion_notes for update to authenticated
  using (private.is_member(club_id) and created_by = (select auth.uid()))
  with check (private.is_member(club_id) and created_by = (select auth.uid()));
create policy "remove own notes, or as admin" on public.discussion_notes for delete to authenticated
  using (private.is_member(club_id) and (created_by = (select auth.uid()) or private.is_admin(club_id)));

create policy "members read club reviews" on public.book_reviews for select to authenticated
  using (private.is_member(club_id));
create policy "remove own club review, or as admin" on public.book_reviews for delete to authenticated
  using (private.is_member(club_id) and (created_by = (select auth.uid()) or private.is_admin(club_id)));
