-- Commonplace 4/6: reading cycles, nominations, ranked ballots, results.
--
-- A cycle's stored status only ever moves through private.sync_cycle(), which
-- does what the clock says is due. Pages and mutations call it first, so no
-- scheduler is needed and nothing can be submitted after a deadline even if no
-- one has visited since.

create type public.cycle_status as enum (
  'scheduled', 'nominating', 'nominations_closed', 'voting', 'runoff',
  'awaiting_decision', 'reading', 'completed', 'cancelled'
);
create type public.decision_method as enum ('vote', 'runoff', 'admin_decision', 'sole_nomination');
create type public.progress_status as enum ('not_started', 'reading', 'finished');

create table public.reading_cycles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  number int not null,
  book_id uuid references public.books (id) on delete restrict,
  status public.cycle_status not null default 'scheduled',
  nomination_opens_at timestamptz not null,
  nomination_closes_at timestamptz not null,
  voting_opens_at timestamptz not null,
  voting_closes_at timestamptz not null,
  runoff_closes_at timestamptz,
  reading_starts_at timestamptz not null,
  reading_ends_at timestamptz not null,
  selected_at timestamptz,
  decision_method public.decision_method,
  decision_reason text check (char_length(decision_reason) <= 2000),
  decided_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, club_id),
  unique (club_id, number),
  check (nomination_opens_at < nomination_closes_at),
  check (nomination_closes_at <= voting_opens_at),
  check (voting_opens_at < voting_closes_at),
  check (reading_starts_at < reading_ends_at),
  check (status not in ('reading', 'completed') or book_id is not null)
);
-- One shared cycle at a time.
create unique index reading_cycles_one_active on public.reading_cycles (club_id)
  where status not in ('completed', 'cancelled');

create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null,
  club_id uuid not null,
  book_id uuid not null references public.books (id) on delete restrict,
  nominated_by uuid references public.profiles (id) on delete set null,
  explanation text check (char_length(explanation) <= 4000),
  in_runoff boolean not null default false,
  is_finalist boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (id, cycle_id),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade
);
create unique index nominations_one_per_member on public.nominations (cycle_id, nominated_by) where withdrawn_at is null;
create unique index nominations_one_per_book on public.nominations (cycle_id, book_id) where withdrawn_at is null;
create index nominations_club_idx on public.nominations (club_id, book_id);
create trigger nominations_touch before update on public.nominations
  for each row execute function private.touch_updated_at();

-- round 1 is the vote, round 2 the runoff.
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.reading_cycles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round smallint not null default 1 check (round in (1, 2)),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, user_id, round),
  unique (id, cycle_id)
);
create table public.vote_rankings (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null,
  cycle_id uuid not null,
  nomination_id uuid not null,
  rank int not null check (rank >= 1),
  unique (vote_id, rank),
  unique (vote_id, nomination_id),
  foreign key (vote_id, cycle_id) references public.votes (id, cycle_id) on delete cascade,
  -- A ranking can only name a nomination from its own cycle.
  foreign key (nomination_id, cycle_id) references public.nominations (id, cycle_id) on delete cascade
);
create index vote_rankings_nomination_idx on public.vote_rankings (nomination_id);

-- Aggregates are only written when a round closes, so there is nothing to leak
-- beforehand.
create table public.vote_rounds (
  cycle_id uuid not null,
  club_id uuid not null,
  round smallint not null check (round in (1, 2)),
  ballots_cast int not null,
  eligible_voters int not null,
  closed_at timestamptz not null default now(),
  primary key (cycle_id, round),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade
);
create table public.vote_results (
  cycle_id uuid not null,
  club_id uuid not null,
  round smallint not null,
  nomination_id uuid not null,
  score int not null,
  is_top boolean not null default false,
  primary key (cycle_id, round, nomination_id),
  foreign key (cycle_id, round) references public.vote_rounds (cycle_id, round) on delete cascade,
  foreign key (nomination_id, cycle_id) references public.nominations (id, cycle_id) on delete cascade,
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id) on delete cascade
);

create table public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.reading_cycles (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status public.progress_status not null default 'not_started',
  current_page int check (current_page between 0 and 50000),
  percentage smallint check (percentage between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);
create trigger reading_progress_touch before update on public.reading_progress
  for each row execute function private.touch_updated_at();

-- ----------------------------------------------------------- state machine

create function private.active_nomination_count(p_cycle uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.nominations where cycle_id = p_cycle and withdrawn_at is null;
$$;

create function private.select_book(
  p_cycle uuid, p_nomination uuid, p_method public.decision_method,
  p_reason text default null, p_by uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; v_book uuid;
begin
  select * into c from public.reading_cycles where id = p_cycle;
  select book_id into v_book from public.nominations where id = p_nomination and cycle_id = p_cycle;
  update public.reading_cycles set
    book_id = v_book, status = 'reading', selected_at = now(),
    decision_method = p_method, decision_reason = p_reason, decided_by = p_by,
    -- If the decision came late, keep the reading period its full length.
    reading_starts_at = greatest(c.reading_starts_at, now()),
    reading_ends_at = greatest(c.reading_starts_at, now()) + (c.reading_ends_at - c.reading_starts_at)
  where id = p_cycle;
  update public.nominations set is_finalist = (id = p_nomination) where cycle_id = p_cycle;
  perform private.ensure_club_book(c.club_id, v_book, null, 'nominated');
  perform private.record_event(c.club_id, p_by, 'book_selected', p_cycle, v_book);
end $$;

-- Borda count: with N books, first place earns N points and last place 1.
create function private.close_round(p_cycle uuid, p_round smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.reading_cycles; n int; ballots int; eligible int; top int; winners uuid[];
begin
  select * into c from public.reading_cycles where id = p_cycle;
  select count(*) into n from public.nominations
    where cycle_id = p_cycle and withdrawn_at is null and (p_round = 1 or in_runoff);
  select count(*) into eligible from public.club_memberships where club_id = c.club_id;
  -- Ballots from people who have since left the club are not counted.
  select count(*) into ballots from public.votes v
    where v.cycle_id = p_cycle and v.round = p_round and private.is_member_user(c.club_id, v.user_id);

  insert into public.vote_rounds (cycle_id, club_id, round, ballots_cast, eligible_voters)
  values (p_cycle, c.club_id, p_round, ballots, eligible);
  insert into public.vote_results (cycle_id, club_id, round, nomination_id, score)
  select p_cycle, c.club_id, p_round, nom.id, coalesce((
      select sum(n - r.rank + 1) from public.vote_rankings r
      join public.votes v on v.id = r.vote_id
      where r.nomination_id = nom.id and v.round = p_round and private.is_member_user(c.club_id, v.user_id)
    ), 0)
  from public.nominations nom
  where nom.cycle_id = p_cycle and nom.withdrawn_at is null and (p_round = 1 or nom.in_runoff);

  select max(score) into top from public.vote_results where cycle_id = p_cycle and round = p_round;
  update public.vote_results set is_top = (ballots > 0 and score = top)
    where cycle_id = p_cycle and round = p_round;
  select array_agg(nomination_id) into winners from public.vote_results
    where cycle_id = p_cycle and round = p_round and score = top;

  if ballots > 0 and cardinality(winners) = 1 then
    perform private.select_book(p_cycle, winners[1],
      case when p_round = 1 then 'vote' else 'runoff' end::public.decision_method);
  elsif ballots > 0 and p_round = 1 then
    update public.nominations set in_runoff = (id = any (winners)) where cycle_id = p_cycle;
    update public.reading_cycles set status = 'runoff',
      runoff_closes_at = now() + make_interval(days => (select default_runoff_days from public.clubs where id = c.club_id))
      where id = p_cycle;
    perform private.record_event(c.club_id, null, 'runoff_opened', p_cycle);
  else
    -- Still tied after a runoff, or nobody voted: an administrator decides.
    update public.nominations set is_finalist = (id = any (winners)) where cycle_id = p_cycle;
    update public.reading_cycles set status = 'awaiting_decision' where id = p_cycle;
    perform private.record_event(c.club_id, null, 'decision_needed', p_cycle);
  end if;
end $$;

create function private.sync_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  select * into c from public.reading_cycles where id = p_cycle for update;
  if not found then return; end if;

  if c.status = 'scheduled' and now() >= c.nomination_opens_at then
    update public.reading_cycles set status = 'nominating' where id = p_cycle;
    c.status := 'nominating';
    perform private.record_event(c.club_id, null, 'nominations_opened', p_cycle);
  end if;
  if c.status = 'nominating' and now() >= c.nomination_closes_at then
    update public.reading_cycles set status = 'nominations_closed' where id = p_cycle;
    c.status := 'nominations_closed';
    perform private.record_event(c.club_id, null, 'nominations_closed', p_cycle,
      null, private.active_nomination_count(p_cycle) < 2 or now() < c.voting_opens_at);
  end if;
  -- A vote needs at least two books; otherwise an administrator is asked.
  if c.status = 'nominations_closed' and now() >= c.voting_opens_at
     and private.active_nomination_count(p_cycle) >= 2 then
    update public.reading_cycles set status = 'voting' where id = p_cycle;
    c.status := 'voting';
    perform private.record_event(c.club_id, null, 'voting_opened', p_cycle);
  end if;
  if c.status = 'voting' and now() >= c.voting_closes_at then
    perform private.close_round(p_cycle, 1::smallint);
  elsif c.status = 'runoff' and now() >= c.runoff_closes_at then
    perform private.close_round(p_cycle, 2::smallint);
  end if;
end $$;

create function public.sync_club(p_club_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_member(p_club_id);
  -- Only take the lock when a deadline has actually passed.
  select id into v_id from public.reading_cycles c
  where c.club_id = p_club_id and (
       (c.status = 'scheduled' and now() >= c.nomination_opens_at)
    or (c.status = 'nominating' and now() >= c.nomination_closes_at)
    or (c.status = 'nominations_closed' and now() >= c.voting_opens_at
        and private.active_nomination_count(c.id) >= 2)
    or (c.status = 'voting' and now() >= c.voting_closes_at)
    or (c.status = 'runoff' and now() >= c.runoff_closes_at));
  if v_id is not null then perform private.sync_cycle(v_id); end if;
end $$;

-- Locks the cycle, brings it up to date and returns it. Not-a-member and
-- no-such-cycle look the same.
create function private.load_cycle(p_cycle uuid, p_admin boolean) returns public.reading_cycles
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  select * into c from public.reading_cycles where id = p_cycle;
  if not found or not private.is_member(c.club_id) then
    perform private.fail('That reading cycle could not be found.');
  end if;
  if p_admin then perform private.assert_admin(c.club_id); end if;
  perform private.sync_cycle(p_cycle);
  select * into c from public.reading_cycles where id = p_cycle;
  return c;
end $$;

-- -------------------------------------------------------- cycle management

create function private.assert_schedule(
  a timestamptz, b timestamptz, c timestamptz, d timestamptz, e timestamptz, f timestamptz
) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if a is null or b is null or c is null or d is null or e is null or f is null then
    perform private.fail('Every date in the schedule is needed.');
  end if;
  if not (a < b and b <= c and c < d and d <= e and e < f) then
    perform private.fail('The dates need to run in order: nominations, then voting, then reading.');
  end if;
end $$;

create function public.create_cycle(
  p_club_id uuid, p_nomination_opens_at timestamptz, p_nomination_closes_at timestamptz,
  p_voting_opens_at timestamptz, p_voting_closes_at timestamptz,
  p_reading_starts_at timestamptz, p_reading_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.assert_admin(p_club_id);
  perform private.assert_schedule(p_nomination_opens_at, p_nomination_closes_at, p_voting_opens_at,
    p_voting_closes_at, p_reading_starts_at, p_reading_ends_at);
  if p_nomination_closes_at <= now() then
    perform private.fail('Nominations need to close in the future.');
  end if;
  perform 1 from public.clubs where id = p_club_id for update;
  if exists (select 1 from public.reading_cycles
             where club_id = p_club_id and status not in ('completed', 'cancelled')) then
    perform private.fail('This club already has a reading cycle under way. Complete it before starting another.');
  end if;
  insert into public.reading_cycles (club_id, number, nomination_opens_at, nomination_closes_at,
    voting_opens_at, voting_closes_at, reading_starts_at, reading_ends_at, created_by)
  values (p_club_id,
    (select coalesce(max(number), 0) + 1 from public.reading_cycles where club_id = p_club_id),
    p_nomination_opens_at, p_nomination_closes_at, p_voting_opens_at, p_voting_closes_at,
    p_reading_starts_at, p_reading_ends_at, auth.uid())
  returning id into new_id;
  perform private.sync_cycle(new_id);
  return new_id;
end $$;

-- Dates that have already taken effect cannot be rewritten here.
create function public.update_cycle_schedule(
  p_cycle_id uuid, p_nomination_opens_at timestamptz, p_nomination_closes_at timestamptz,
  p_voting_opens_at timestamptz, p_voting_closes_at timestamptz,
  p_reading_starts_at timestamptz, p_reading_ends_at timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status in ('completed', 'cancelled') then
    perform private.fail('This cycle is finished, so its dates are fixed.');
  end if;
  if c.status = 'scheduled' then
    c.nomination_opens_at := p_nomination_opens_at;
  end if;
  if c.status in ('scheduled', 'nominating') then
    c.nomination_closes_at := p_nomination_closes_at;
  end if;
  if c.status in ('scheduled', 'nominating', 'nominations_closed') then
    c.voting_opens_at := p_voting_opens_at;
  end if;
  if c.status in ('scheduled', 'nominating', 'nominations_closed', 'voting') then
    c.voting_closes_at := p_voting_closes_at;
  end if;
  -- If voting finished early, reading may be brought forward until it begins.
  if c.status <> 'reading' or c.reading_starts_at > now() then
    c.reading_starts_at := p_reading_starts_at;
  end if;
  c.reading_ends_at := p_reading_ends_at;
  if c.status = 'reading' then
    if c.reading_starts_at is null or c.reading_ends_at is null or c.reading_ends_at <= c.reading_starts_at then
      perform private.fail('Reading needs to end after it starts.');
    end if;
  else
    perform private.assert_schedule(c.nomination_opens_at, c.nomination_closes_at, c.voting_opens_at,
      c.voting_closes_at, c.reading_starts_at, c.reading_ends_at);
  end if;
  update public.reading_cycles set
    nomination_opens_at = c.nomination_opens_at, nomination_closes_at = c.nomination_closes_at,
    voting_opens_at = c.voting_opens_at, voting_closes_at = c.voting_closes_at,
    reading_starts_at = c.reading_starts_at, reading_ends_at = c.reading_ends_at
  where id = p_cycle_id;
  perform private.sync_cycle(p_cycle_id);
end $$;

-- Close nominations (if open) and open the vote straight away.
create function public.open_voting_now(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status not in ('nominating', 'nominations_closed') then
    perform private.fail('Voting can only be opened once nominations are under way.');
  end if;
  if private.active_nomination_count(p_cycle_id) < 2 then
    perform private.fail('A vote needs at least two nominated books.');
  end if;
  if c.voting_closes_at <= now() then
    perform private.fail('The voting deadline has passed. Set a new one first.');
  end if;
  update public.reading_cycles set
    nomination_closes_at = least(nomination_closes_at, now()), voting_opens_at = now()
  where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'voting_opened_early', p_cycle_id, null, false);
  perform private.sync_cycle(p_cycle_id);
end $$;

create function public.close_voting_now(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status not in ('voting', 'runoff') then
    perform private.fail('Voting is not open.');
  end if;
  perform private.record_event(c.club_id, auth.uid(), 'voting_closed_early', p_cycle_id, null, false);
  if c.status = 'voting' then
    update public.reading_cycles set voting_closes_at = greatest(now(), voting_opens_at + interval '1 microsecond')
    where id = p_cycle_id;
    perform private.close_round(p_cycle_id, 1::smallint);
  else
    update public.reading_cycles set runoff_closes_at = now() where id = p_cycle_id;
    perform private.close_round(p_cycle_id, 2::smallint);
  end if;
end $$;

-- Reopening nominations changes what is on the ballot, so every ballot and
-- result so far is discarded. Not possible once a book has been chosen.
create function public.reopen_nominations(
  p_cycle_id uuid, p_nomination_closes_at timestamptz, p_voting_closes_at timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; v_start timestamptz;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status not in ('nominations_closed', 'voting', 'runoff', 'awaiting_decision') then
    perform private.fail('Nominations can only be reopened before a book has been chosen.');
  end if;
  if p_nomination_closes_at is null or p_voting_closes_at is null
     or p_nomination_closes_at <= now() or p_voting_closes_at <= p_nomination_closes_at then
    perform private.fail('Choose a future close for nominations, and a later one for voting.');
  end if;
  delete from public.votes where cycle_id = p_cycle_id;
  delete from public.vote_rounds where cycle_id = p_cycle_id;
  update public.nominations set in_runoff = false, is_finalist = false where cycle_id = p_cycle_id;
  v_start := greatest(c.reading_starts_at, p_voting_closes_at);
  update public.reading_cycles set
    status = 'nominating', nomination_opens_at = least(nomination_opens_at, now()),
    nomination_closes_at = p_nomination_closes_at, voting_opens_at = p_nomination_closes_at,
    voting_closes_at = p_voting_closes_at, runoff_closes_at = null,
    reading_starts_at = v_start, reading_ends_at = v_start + (c.reading_ends_at - c.reading_starts_at)
  where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'nominations_reopened', p_cycle_id);
end $$;

-- Only when nobody voted, so no result has been seen that could sway anyone.
create function public.reopen_voting(p_cycle_id uuid, p_closes_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; r smallint; v_start timestamptz;
begin
  c := private.load_cycle(p_cycle_id, true);
  select max(round) into r from public.vote_rounds where cycle_id = p_cycle_id;
  if c.status <> 'awaiting_decision'
     or (select ballots_cast from public.vote_rounds where cycle_id = p_cycle_id and round = r) > 0 then
    perform private.fail('Voting can only be reopened when no ballots were cast.');
  end if;
  if p_closes_at is null or p_closes_at <= now() then
    perform private.fail('Choose a closing time in the future.');
  end if;
  delete from public.votes where cycle_id = p_cycle_id and round = r;
  delete from public.vote_rounds where cycle_id = p_cycle_id and round = r;
  update public.nominations set is_finalist = false where cycle_id = p_cycle_id;
  v_start := greatest(c.reading_starts_at, p_closes_at);
  update public.reading_cycles set
    status = case when r = 1 then 'voting' else 'runoff' end::public.cycle_status,
    voting_closes_at = case when r = 1 then p_closes_at else voting_closes_at end,
    runoff_closes_at = case when r = 2 then p_closes_at else null end,
    reading_starts_at = v_start, reading_ends_at = v_start + (c.reading_ends_at - c.reading_starts_at)
  where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'voting_reopened', p_cycle_id);
end $$;

create function public.confirm_sole_nomination(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; v_nom uuid;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status <> 'nominations_closed' or private.active_nomination_count(p_cycle_id) <> 1 then
    perform private.fail('This is only possible when nominations have closed with a single book.');
  end if;
  select id into v_nom from public.nominations where cycle_id = p_cycle_id and withdrawn_at is null;
  perform private.select_book(p_cycle_id, v_nom, 'sole_nomination', null, auth.uid());
end $$;

create function public.decide_selection(p_cycle_id uuid, p_nomination_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status <> 'awaiting_decision' then
    perform private.fail('An administrator decides only when a vote could not.');
  end if;
  if not exists (select 1 from public.nominations
                 where id = p_nomination_id and cycle_id = p_cycle_id and is_finalist and withdrawn_at is null) then
    perform private.fail('Choose one of the books still in contention.');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform private.fail('Record how the decision was made. The club will see this.');
  end if;
  perform private.select_book(p_cycle_id, p_nomination_id, 'admin_decision', left(btrim(p_reason), 2000), auth.uid());
end $$;

create function public.cancel_cycle(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status in ('completed', 'cancelled') then
    perform private.fail('This cycle is already finished.');
  end if;
  update public.reading_cycles set status = 'cancelled' where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'cycle_cancelled', p_cycle_id);
end $$;

create function public.complete_cycle(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status <> 'reading' then
    perform private.fail('Only a cycle the club is reading can be completed.');
  end if;
  update public.reading_cycles set status = 'completed', completed_at = now() where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'cycle_completed', p_cycle_id, c.book_id);
end $$;

create function public.reopen_cycle(p_cycle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  c := private.load_cycle(p_cycle_id, true);
  if c.status <> 'completed' then
    perform private.fail('Only a completed cycle can be reopened.');
  end if;
  perform 1 from public.clubs where id = c.club_id for update;
  if exists (select 1 from public.reading_cycles
             where club_id = c.club_id and status not in ('completed', 'cancelled')) then
    perform private.fail('Another reading cycle is under way. Finish that one first.');
  end if;
  update public.reading_cycles set status = 'reading', completed_at = null where id = p_cycle_id;
  perform private.record_event(c.club_id, auth.uid(), 'cycle_reopened', p_cycle_id, c.book_id);
end $$;

-- -------------------------------------------------------------- nominations

create function private.assert_nominating(c public.reading_cycles) returns void
language plpgsql stable set search_path = '' as $$
begin
  if c.status = 'scheduled' then perform private.fail('Nominations have not opened yet.'); end if;
  if c.status <> 'nominating' then perform private.fail('Nominations are closed.'); end if;
end $$;

create function public.nominate(p_cycle_id uuid, p_book_id uuid, p_explanation text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; new_id uuid;
begin
  c := private.load_cycle(p_cycle_id, false);
  perform private.assert_nominating(c);
  perform private.assert_book_visible(p_book_id);
  if exists (select 1 from public.nominations
             where cycle_id = p_cycle_id and nominated_by = auth.uid() and withdrawn_at is null) then
    perform private.fail('You have already nominated a book for this cycle. Edit or withdraw that nomination first.');
  end if;
  begin
    insert into public.nominations (cycle_id, club_id, book_id, nominated_by, explanation)
    values (p_cycle_id, c.club_id, p_book_id, auth.uid(), nullif(btrim(p_explanation), ''))
    returning id into new_id;
  exception when unique_violation then
    perform private.fail('That book has already been nominated for this cycle.');
  end;
  perform private.ensure_club_book(c.club_id, p_book_id, auth.uid(), 'nominated');
  perform private.record_event(c.club_id, auth.uid(), 'book_nominated', new_id, p_book_id, false);
  return new_id;
end $$;

create function public.update_nomination(p_nomination_id uuid, p_book_id uuid, p_explanation text) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.nominations; c public.reading_cycles;
begin
  select * into n from public.nominations
  where id = p_nomination_id and nominated_by = auth.uid() and withdrawn_at is null;
  if not found then perform private.fail('That nomination could not be found.'); end if;
  c := private.load_cycle(n.cycle_id, false);
  perform private.assert_nominating(c);
  perform private.assert_book_visible(p_book_id);
  begin
    update public.nominations set book_id = p_book_id, explanation = nullif(btrim(p_explanation), '')
    where id = p_nomination_id;
  exception when unique_violation then
    perform private.fail('That book has already been nominated for this cycle.');
  end;
  perform private.ensure_club_book(c.club_id, p_book_id, auth.uid(), 'nominated');
  update public.activity_events set book_id = p_book_id where reference_id = p_nomination_id;
end $$;

create function public.withdraw_nomination(p_nomination_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.nominations; c public.reading_cycles;
begin
  select * into n from public.nominations
  where id = p_nomination_id and nominated_by = auth.uid() and withdrawn_at is null;
  if not found then perform private.fail('That nomination could not be found.'); end if;
  c := private.load_cycle(n.cycle_id, false);
  perform private.assert_nominating(c);
  update public.nominations set withdrawn_at = now() where id = p_nomination_id;
  delete from public.activity_events where reference_id = p_nomination_id;
end $$;

-- Someone who leaves mid-nominations takes their nomination with them. Once
-- voting has begun the ballot is fixed, so it stays.
create function private.withdraw_departed_nomination() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.nominations n set withdrawn_at = now()
  from public.reading_cycles c
  where c.id = n.cycle_id and c.club_id = old.club_id and c.status in ('scheduled', 'nominating')
    and n.nominated_by = old.user_id and n.withdrawn_at is null;
  return null;
end $$;
create trigger memberships_withdraw_nomination after delete on public.club_memberships
  for each row execute function private.withdraw_departed_nomination();

-- ------------------------------------------------------------------ ballots

-- p_ranking lists nomination ids from first choice to last. The whole list is
-- required: partial ballots would make the scores hard to explain.
create function public.submit_ballot(p_cycle_id uuid, p_ranking uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.reading_cycles; v_round smallint; v_vote uuid; n int;
begin
  c := private.load_cycle(p_cycle_id, false);
  if c.status = 'voting' then v_round := 1;
  elsif c.status = 'runoff' then v_round := 2;
  else perform private.fail('Voting is not open, so your ballot was not saved.');
  end if;

  select count(*) into n from public.nominations
  where cycle_id = p_cycle_id and withdrawn_at is null and (v_round = 1 or in_runoff);
  if p_ranking is null or array_ndims(p_ranking) is distinct from 1 or cardinality(p_ranking) <> n
     or array_position(p_ranking, null) is not null
     or (select count(distinct x) from unnest(p_ranking) x) <> n
     or exists (
       select 1 from unnest(p_ranking) x where not exists (
         select 1 from public.nominations nom
         where nom.id = x and nom.cycle_id = p_cycle_id and nom.withdrawn_at is null
           and (v_round = 1 or nom.in_runoff)))
  then
    perform private.fail('A ballot ranks every nominated book exactly once.');
  end if;

  insert into public.votes (cycle_id, user_id, round) values (p_cycle_id, auth.uid(), v_round)
  on conflict (cycle_id, user_id, round) do update set updated_at = now()
  returning id into v_vote;
  delete from public.vote_rankings where vote_id = v_vote;
  insert into public.vote_rankings (vote_id, cycle_id, nomination_id, rank)
  select v_vote, p_cycle_id, x, ord::int from unnest(p_ranking) with ordinality as t (x, ord);
end $$;

-- How many, never who or how.
create function public.ballot_count(p_cycle_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.reading_cycles;
begin
  select * into c from public.reading_cycles where id = p_cycle_id;
  if not found or not private.is_member(c.club_id) then
    perform private.fail('That reading cycle could not be found.');
  end if;
  return jsonb_build_object(
    'cast', (select count(*) from public.votes v where v.cycle_id = p_cycle_id
             and v.round = case when c.status = 'runoff' then 2 else 1 end
             and private.is_member_user(c.club_id, v.user_id)),
    'eligible', (select count(*) from public.club_memberships where club_id = c.club_id));
end $$;

-- ---------------------------------------------------------------------- RLS

create function private.is_cycle_member(p_cycle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reading_cycles c
    join public.club_memberships m on m.club_id = c.club_id
    where c.id = p_cycle and m.user_id = auth.uid());
$$;

create function private.can_update_progress(p_cycle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_cycle_member(p_cycle)
    and exists (select 1 from public.reading_cycles where id = p_cycle and status = 'reading');
$$;

alter table public.reading_cycles enable row level security;
alter table public.nominations enable row level security;
alter table public.votes enable row level security;
alter table public.vote_rankings enable row level security;
alter table public.vote_rounds enable row level security;
alter table public.vote_results enable row level security;
alter table public.reading_progress enable row level security;

create policy "members read cycles" on public.reading_cycles for select to authenticated
  using (private.is_member(club_id));
create policy "members read nominations" on public.nominations for select to authenticated
  using (private.is_member(club_id) and (withdrawn_at is null or nominated_by = (select auth.uid())));

-- Your own ballot and nobody else's, administrators included.
create policy "own ballot only" on public.votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own rankings only" on public.vote_rankings for select to authenticated
  using (exists (select 1 from public.votes v where v.id = vote_id and v.user_id = (select auth.uid())));

create policy "members read closed rounds" on public.vote_rounds for select to authenticated
  using (private.is_member(club_id));
create policy "members read results" on public.vote_results for select to authenticated
  using (private.is_member(club_id));

create policy "members see progress" on public.reading_progress for select to authenticated
  using (private.is_cycle_member(cycle_id));
create policy "record own progress" on public.reading_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_update_progress(cycle_id));
create policy "update own progress" on public.reading_progress for update to authenticated
  using (user_id = (select auth.uid()) and private.can_update_progress(cycle_id))
  with check (user_id = (select auth.uid()) and private.can_update_progress(cycle_id));
