-- Finding a date for a meeting, and private calendar links.

-- ------------------------------------------------------------ finding a date

create type public.poll_status as enum ('open', 'decided', 'stopped');
create type public.poll_answer as enum ('yes', 'if_needed', 'no');

create table public.meeting_polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  cycle_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  location text check (char_length(location) <= 500),
  timezone text not null,
  status public.poll_status not null default 'open',
  meeting_id uuid references public.meetings (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (cycle_id, club_id) references public.reading_cycles (id, club_id)
);
create index meeting_polls_club_idx on public.meeting_polls (club_id, status);
create index meeting_polls_cycle_idx on public.meeting_polls (cycle_id);
create index meeting_polls_meeting_idx on public.meeting_polls (meeting_id);
create trigger meeting_polls_timezone before insert or update on public.meeting_polls
  for each row execute function private.check_timezone();

create table public.meeting_poll_times (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.meeting_polls (id) on delete cascade,
  starts_at timestamptz not null,
  unique (poll_id, starts_at),
  unique (id, poll_id)
);

create table public.meeting_poll_answers (
  time_id uuid not null,
  poll_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer public.poll_answer not null,
  primary key (time_id, user_id),
  foreign key (time_id, poll_id) references public.meeting_poll_times (id, poll_id) on delete cascade
);
create index meeting_poll_answers_poll_idx on public.meeting_poll_answers (poll_id);
create index meeting_poll_answers_user_idx on public.meeting_poll_answers (user_id);

create function private.is_poll_member(p_poll uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meeting_polls p
    join public.club_memberships m on m.club_id = p.club_id
    where p.id = p_poll and m.user_id = auth.uid());
$$;

-- The poll, locked, for a member; for an administrator only, if asked.
create function private.load_poll(p_poll uuid, p_admin boolean) returns public.meeting_polls
language plpgsql security definer set search_path = '' as $$
declare p public.meeting_polls;
begin
  select * into p from public.meeting_polls where id = p_poll for update;
  if not found or not private.is_member(p.club_id) then
    perform private.fail('That could not be found.');
  end if;
  if p_admin and not private.is_admin(p.club_id) then
    perform private.fail('Only a club administrator can do that.');
  end if;
  if p.status <> 'open' then
    perform private.fail('This has been settled already.');
  end if;
  return p;
end $$;

create function public.create_meeting_poll(
  p_club_id uuid, p_cycle_id uuid, p_title text, p_location text, p_timezone text, p_times timestamptz[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; n int;
begin
  if not private.is_admin(p_club_id) then
    perform private.fail('Only a club administrator can do that.');
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    perform private.fail('Give the meeting a title of up to 160 characters.');
  end if;
  select count(distinct t) into n from unnest(p_times) t;
  if n not between 2 and 8 then
    perform private.fail('Suggest between two and eight different times.');
  end if;
  if exists (select 1 from unnest(p_times) t where t is null or t <= now() or t > now() + interval '2 years') then
    perform private.fail('Every time must be in the future.');
  end if;
  if not private.allow('meeting_poll', 20, interval '1 day') then
    perform private.fail('That is a lot for one day. Please try again tomorrow.');
  end if;
  insert into public.meeting_polls (club_id, cycle_id, title, location, timezone, created_by)
  values (p_club_id, p_cycle_id, btrim(p_title), nullif(btrim(p_location), ''), p_timezone, auth.uid())
  returning id into new_id;
  insert into public.meeting_poll_times (poll_id, starts_at) select distinct new_id, t from unnest(p_times) t;
  perform private.record_event(p_club_id, auth.uid(), 'poll_opened', new_id);
  return new_id;
end $$;

create function public.add_meeting_poll_time(p_poll_id uuid, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.meeting_polls;
begin
  p := private.load_poll(p_poll_id, true);
  if p_starts_at is null or p_starts_at <= now() or p_starts_at > now() + interval '2 years' then
    perform private.fail('Every time must be in the future.');
  end if;
  if (select count(*) from public.meeting_poll_times where poll_id = p_poll_id) >= 12 then
    perform private.fail('There are twelve times already. Choose one, or start again.');
  end if;
  insert into public.meeting_poll_times (poll_id, starts_at) values (p_poll_id, p_starts_at)
  on conflict (poll_id, starts_at) do nothing;
  if not found then perform private.fail('That time has already been suggested.'); end if;
  perform private.record_event(p.club_id, auth.uid(), 'poll_time_added', p_poll_id);
end $$;

-- p_answers: {"<time id>": "yes" | "if_needed" | "no", ...}
create function public.answer_meeting_poll(p_poll_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.load_poll(p_poll_id, false);
  if jsonb_typeof(p_answers) is distinct from 'object' or p_answers = '{}'::jsonb then
    perform private.fail('Choose an answer.');
  end if;
  if exists (
    select 1 from jsonb_each_text(p_answers) a
    where a.value is null or a.value not in ('yes', 'if_needed', 'no')
       or not exists (select 1 from public.meeting_poll_times t where t.poll_id = p_poll_id and t.id::text = a.key)
  ) then
    perform private.fail('Those times have changed. Please look again.');
  end if;
  insert into public.meeting_poll_answers (time_id, poll_id, user_id, answer)
  select a.key::uuid, p_poll_id, auth.uid(), a.value::public.poll_answer from jsonb_each_text(p_answers) a
  on conflict (time_id, user_id) do update set answer = excluded.answer;
end $$;

-- Makes the meeting. What people said about that time becomes their answer to it.
create function public.choose_meeting_time(p_time_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.meeting_polls; t public.meeting_poll_times; new_id uuid;
begin
  select * into t from public.meeting_poll_times where id = p_time_id;
  if not found then perform private.fail('That could not be found.'); end if;
  p := private.load_poll(t.poll_id, true);
  if t.starts_at <= now() then perform private.fail('That time has passed. Choose another.'); end if;
  insert into public.meetings (club_id, cycle_id, title, location, timezone, starts_at, created_by)
  values (
    p.club_id,
    (select c.id from public.reading_cycles c where c.id = p.cycle_id and c.status <> 'cancelled'),
    p.title, p.location, p.timezone, t.starts_at, auth.uid())
  returning id into new_id;
  insert into public.meeting_attendees (meeting_id, user_id, attendance_status)
  select new_id, a.user_id, (case a.answer when 'yes' then 'going' when 'if_needed' then 'maybe' else 'not_going' end)::public.attendance_status
  from public.meeting_poll_answers a
  join public.club_memberships m on m.club_id = p.club_id and m.user_id = a.user_id
  where a.time_id = t.id;
  update public.meeting_polls set status = 'decided', meeting_id = new_id where id = p.id;
  return new_id;
end $$;

create function public.stop_meeting_poll(p_poll_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.load_poll(p_poll_id, true);
  update public.meeting_polls set status = 'stopped' where id = p_poll_id;
  -- Nothing is left to answer, so nobody needs to be asked.
  delete from public.notifications where reference_id = p_poll_id;
  delete from public.activity_events where reference_id = p_poll_id;
end $$;

alter table public.meeting_polls enable row level security;
alter table public.meeting_poll_times enable row level security;
alter table public.meeting_poll_answers enable row level security;
create policy "members see polls" on public.meeting_polls for select to authenticated
  using (private.is_member(club_id));
create policy "members see suggested times" on public.meeting_poll_times for select to authenticated
  using (private.is_poll_member(poll_id));
create policy "members see answers" on public.meeting_poll_answers for select to authenticated
  using (private.is_poll_member(poll_id));

-- -------------------------------------------------------------- calendar links

-- The link itself is never stored. The server derives it from the nonce and a
-- secret of its own; the database keeps only a hash to recognise it by.
create table public.calendar_links (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  nonce uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.calendar_links enable row level security;
create policy "see own calendar link" on public.calendar_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy "make own calendar link" on public.calendar_links for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "renew own calendar link" on public.calendar_links for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "turn off own calendar link" on public.calendar_links for delete to authenticated
  using (user_id = (select auth.uid()));

-- What a calendar app sees: when and where, for the clubs the reader is in now.
-- Null means there is no such link. No notes, agenda, answers or names.
create function public.calendar_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid;
begin
  if p_token is null or char_length(p_token) <> 43 then return null; end if;
  select user_id into v_user from public.calendar_links
  where token_hash = encode(private.hash_token(p_token), 'hex');
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'club', c.name, 'title', m.title, 'starts_at', m.starts_at, 'location', m.location,
      'cancelled', m.status = 'cancelled', 'created_at', m.created_at, 'updated_at', m.updated_at) order by m.starts_at)
    from public.meetings m
    join public.clubs c on c.id = m.club_id
    join public.club_memberships cm on cm.club_id = m.club_id and cm.user_id = v_user
    where m.starts_at > now() - interval '1 year'
      and not exists (
        select 1 from public.meeting_attendees a
        where a.meeting_id = m.id and a.user_id = v_user and a.attendance_status = 'not_going')
  ), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ privileges

revoke all on public.meeting_polls, public.meeting_poll_times, public.meeting_poll_answers, public.calendar_links
  from public, anon, authenticated;
grant select on public.meeting_polls, public.meeting_poll_times, public.meeting_poll_answers, public.calendar_links to authenticated;
grant insert (user_id, nonce, token_hash), update (nonce, token_hash), delete on public.calendar_links to authenticated;

revoke execute on function
  private.is_poll_member(uuid), private.load_poll(uuid, boolean),
  public.create_meeting_poll(uuid, uuid, text, text, text, timestamptz[]), public.add_meeting_poll_time(uuid, timestamptz),
  public.answer_meeting_poll(uuid, jsonb), public.choose_meeting_time(uuid), public.stop_meeting_poll(uuid),
  public.calendar_feed(text)
  from public, anon, authenticated;
grant execute on function private.is_poll_member(uuid) to authenticated;
grant execute on function
  public.create_meeting_poll(uuid, uuid, text, text, text, timestamptz[]), public.add_meeting_poll_time(uuid, timestamptz),
  public.answer_meeting_poll(uuid, jsonb), public.choose_meeting_time(uuid), public.stop_meeting_poll(uuid)
  to authenticated;
-- A calendar app is not signed in. The link is what it has to show.
grant execute on function public.calendar_feed(text) to anon, authenticated;
