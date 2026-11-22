-- Commonplace 1/6: identity, clubs, membership, invitations, activity.
--
-- Conventions used throughout these migrations
--   * Every table in `public` has RLS enabled. Migration 6 revokes everything
--     from anon/authenticated and re-grants only what each policy expects, so
--     nothing depends on a project's default privileges.
--   * Rules that span rows live in SECURITY DEFINER functions in `public`
--     (called through PostgREST) which check auth.uid() themselves.
--   * Helpers live in `private`, which is never exposed by the API.
--   * Errors meant for people are raised with private.fail() (SQLSTATE P0001).
--     The app shows only those messages verbatim.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.club_role as enum ('admin', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ---------------------------------------------------------------- helpers

create function private.fail(message text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', message using errcode = 'P0001';
end $$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- --------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url text check (avatar_url ~ '^https://' and char_length(avatar_url) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- A profile for every account. The display name is the only thing read from
-- user-editable metadata; it never carries authority.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(left(new.raw_user_meta_data ->> 'display_name', 80)), ''), 'Reader')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts made before this migration was applied need a profile too.
insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(btrim(left(u.raw_user_meta_data ->> 'display_name', 80)), ''), 'Reader')
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------------ clubs

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 2000),
  image_url text check (image_url ~ '^https://' and char_length(image_url) <= 1000),
  timezone text not null default 'UTC',
  default_nomination_days int not null default 7 check (default_nomination_days between 1 and 90),
  default_voting_days int not null default 5 check (default_voting_days between 1 and 90),
  default_reading_days int not null default 30 check (default_reading_days between 1 and 365),
  default_runoff_days int not null default 2 check (default_runoff_days between 1 and 30),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clubs_touch before update on public.clubs
  for each row execute function private.touch_updated_at();

create function private.assert_timezone(tz text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    perform private.fail('That timezone is not recognised.');
  end if;
end $$;

create function private.check_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    perform private.assert_timezone(new.timezone);
  end if;
  return new;
end $$;
create trigger clubs_timezone before insert or update on public.clubs
  for each row execute function private.check_timezone();

create table public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index club_memberships_user_idx on public.club_memberships (user_id);

-- People who used to belong, so the archive can still show their names.
create table private.former_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  left_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create function private.is_member(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_memberships m
    where m.club_id = p_club and m.user_id = (select auth.uid())
  );
$$;

create function private.is_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_memberships m
    where m.club_id = p_club and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create function private.is_member_user(p_club uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_memberships m where m.club_id = p_club and m.user_id = p_user
  );
$$;

create function private.assert_member(p_club uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_club) then
    -- Same wording whether or not the club exists.
    perform private.fail('You are not a member of this club.');
  end if;
end $$;

create function private.assert_admin(p_club uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_member(p_club);
  if not private.is_admin(p_club) then
    perform private.fail('Only a club administrator can do that.');
  end if;
end $$;

-- You can see a profile if it is yours, if you share a club now, or if that
-- person once belonged to a club you are in.
create function private.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
    or exists (
      select 1 from public.club_memberships mine
      join public.club_memberships theirs on theirs.club_id = mine.club_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
    )
    or exists (
      select 1 from public.club_memberships mine
      join private.former_members f on f.club_id = mine.club_id
      where mine.user_id = (select auth.uid()) and f.user_id = p_user
    );
$$;

-- ---------------------------------------------------- activity + notifications

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (char_length(type) <= 60),
  reference_id uuid,
  book_id uuid, -- foreign key added once books exists
  -- clock_timestamp: several events in one transaction must keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index activity_events_club_idx on public.activity_events (club_id, created_at desc);
create index activity_events_ref_idx on public.activity_events (reference_id);

-- Notifications carry a type and a reference, never any prose.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (char_length(type) <= 60),
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_ref_idx on public.notifications (reference_id);

create function private.record_event(
  p_club uuid, p_actor uuid, p_type text, p_ref uuid default null,
  p_book uuid default null, p_notify boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_events (club_id, actor_id, type, reference_id, book_id)
  values (p_club, p_actor, p_type, p_ref, p_book);
  if p_notify then
    insert into public.notifications (user_id, club_id, actor_id, type, reference_id)
    select m.user_id, p_club, p_actor, p_type, p_ref
    from public.club_memberships m
    where m.club_id = p_club and m.user_id is distinct from p_actor;
  end if;
end $$;

-- ------------------------------------------------------------- rate limiting

create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (user_id, action)
);

-- Returns false once the caller is over the limit. Note that raising in the
-- same transaction would undo the count, so callers that must remember failed
-- attempts return a status instead of raising.
create function private.allow(p_action text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into private.rate_limits as r (user_id, action, window_start, hits)
  values (auth.uid(), p_action, now(), 1)
  on conflict (user_id, action) do update set
    hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into n;
  return n <= p_max;
end $$;

-- ------------------------------------------------------- membership invariants

-- Last-admin protection. Locking the club row serialises concurrent role
-- changes, so two admins cannot demote each other at the same instant.
create function private.protect_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.club_id <> old.club_id or new.user_id <> old.user_id) then
    perform private.fail('A membership cannot be moved.');
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    perform 1 from public.clubs where id = old.club_id for update;
    -- Not found means the club itself is being deleted; let the cascade run.
    if found and not exists (
      select 1 from public.club_memberships
      where club_id = old.club_id and role = 'admin' and id <> old.id
    ) then
      perform private.fail('A club must always have at least one administrator. Make someone else an administrator first.');
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger memberships_protect_last_admin
  before update or delete on public.club_memberships
  for each row execute function private.protect_last_admin();

-- ------------------------------------------------------------- invitations

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  token_hash bytea not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index invitations_club_idx on public.invitations (club_id, status);

create function private.hash_token(p_token text) returns bytea
language sql immutable set search_path = '' as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));
$$;

-- What happens when someone leaves or is removed. Personal libraries are not
-- referenced here at all: they belong to the person, not to the club.
create function private.after_membership_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clubs where id = old.club_id)
     or not exists (select 1 from public.profiles where id = old.user_id) then
    return null;
  end if;
  insert into private.former_members (club_id, user_id) values (old.club_id, old.user_id)
  on conflict (club_id, user_id) do update set left_at = now();
  update public.invitations set status = 'revoked', revoked_at = now()
  where club_id = old.club_id and invited_by = old.user_id and status = 'pending';
  delete from public.notifications where user_id = old.user_id and club_id = old.club_id;
  return null;
end $$;
create trigger memberships_after_delete after delete on public.club_memberships
  for each row execute function private.after_membership_delete();

create function private.after_membership_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.former_members where club_id = new.club_id and user_id = new.user_id;
  return null;
end $$;
create trigger memberships_after_insert after insert on public.club_memberships
  for each row execute function private.after_membership_insert();

-- --------------------------------------------------------------------- RPCs

create function public.create_club(p_name text, p_description text default null, p_timezone text default 'UTC')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    perform private.fail('Give the club a name of up to 80 characters.');
  end if;
  if not private.allow('create_club', 10, interval '1 day') then
    perform private.fail('You have created several clubs today. Please try again tomorrow.');
  end if;
  insert into public.clubs (name, description, timezone, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_timezone, 'UTC'), auth.uid())
  returning id into new_id;
  insert into public.club_memberships (club_id, user_id, role) values (new_id, auth.uid(), 'admin');
  perform private.record_event(new_id, auth.uid(), 'club_created', new_id, null, false);
  return new_id;
end $$;

-- Returns the raw token exactly once. Two v4 UUIDs give 244 bits from the
-- server's cryptographic generator; only the SHA-256 is kept.
create function public.create_invitation(p_club_id uuid)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare raw text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform private.assert_member(p_club_id);
  if (select count(*) from public.invitations i
      where i.invited_by = auth.uid() and i.created_at > now() - interval '1 hour') >= 20 then
    perform private.fail('You have created a lot of invitations in the last hour. Please wait a while.');
  end if;
  return query
    insert into public.invitations (club_id, token_hash, invited_by)
    values (p_club_id, private.hash_token(raw), auth.uid())
    returning invitations.id, raw, invitations.expires_at;
end $$;

create function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation_id for update;
  if not found or not private.is_member(inv.club_id)
     or not (inv.invited_by is not distinct from auth.uid() or private.is_admin(inv.club_id)) then
    perform private.fail('That invitation could not be found.');
  end if;
  if inv.status <> 'pending' then
    perform private.fail('Only a pending invitation can be revoked.');
  end if;
  update public.invitations set status = 'revoked', revoked_at = now() where id = inv.id;
end $$;

-- Safe for signed-out visitors: reveals a club's name only to someone holding
-- a live token.
create function public.preview_invitation(p_token text) returns jsonb
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
                            'invited_by', inviter, 'expires_at', inv.expires_at);
end $$;

-- Atomic: the row lock means the second of two simultaneous acceptances sees
-- status = 'accepted'. Returns a status rather than raising so that the
-- attempt counter survives.
create function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; club_name text;
begin
  if not private.allow('accept_invitation', 20, interval '15 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into inv from public.invitations where token_hash = private.hash_token(p_token) for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  if private.is_member(inv.club_id) then
    select name into club_name from public.clubs where id = inv.club_id;
    return jsonb_build_object('status', 'already_member', 'club_id', inv.club_id, 'club_name', club_name);
  end if;
  if inv.status = 'accepted' then return jsonb_build_object('status', 'used'); end if;
  if inv.status = 'revoked' then return jsonb_build_object('status', 'revoked'); end if;
  if inv.status = 'expired' or inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = inv.id;
    return jsonb_build_object('status', 'expired');
  end if;

  insert into public.club_memberships (club_id, user_id, role) values (inv.club_id, auth.uid(), 'member')
  on conflict (club_id, user_id) do nothing;
  if not found then
    -- Joined through another link a moment ago: leave this one unspent.
    return jsonb_build_object('status', 'already_member', 'club_id', inv.club_id);
  end if;
  update public.invitations
    set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = inv.id;
  perform private.record_event(inv.club_id, auth.uid(), 'member_joined', auth.uid());
  select name into club_name from public.clubs where id = inv.club_id;
  return jsonb_build_object('status', 'joined', 'club_id', inv.club_id, 'club_name', club_name);
end $$;

create function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role public.club_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin(p_club_id);
  update public.club_memberships set role = p_role where club_id = p_club_id and user_id = p_user_id;
  if not found then perform private.fail('That person is not a member of this club.'); end if;
end $$;

create function public.remove_member(p_club_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin(p_club_id);
  if p_user_id = auth.uid() then
    perform private.fail('To leave the club yourself, use Leave club.');
  end if;
  delete from public.club_memberships where club_id = p_club_id and user_id = p_user_id;
  if not found then perform private.fail('That person is not a member of this club.'); end if;
  perform private.record_event(p_club_id, p_user_id, 'member_left', p_user_id, null, false);
end $$;

create function public.leave_club(p_club_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_member(p_club_id);
  delete from public.club_memberships where club_id = p_club_id and user_id = auth.uid();
  perform private.record_event(p_club_id, auth.uid(), 'member_left', auth.uid(), null, false);
end $$;

-- A sole member cannot leave (the club would have no administrator), so they
-- may close the club instead. Anyone else's shared history blocks this.
create function public.close_club(p_club_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_admin(p_club_id);
  perform 1 from public.clubs where id = p_club_id for update;
  if (select count(*) from public.club_memberships where club_id = p_club_id) > 1 then
    perform private.fail('A club can only be closed by its last remaining member.');
  end if;
  delete from public.clubs where id = p_club_id;
end $$;

-- ---------------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;

create policy "see people you read with" on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members see their clubs" on public.clubs for select to authenticated
  using (private.is_member(id));
create policy "admins edit their club" on public.clubs for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));

create policy "members see the membership" on public.club_memberships for select to authenticated
  using (private.is_member(club_id));

create policy "inviters and admins see invitations" on public.invitations for select to authenticated
  using (private.is_member(club_id) and (invited_by = (select auth.uid()) or private.is_admin(club_id)));

create policy "members see club activity" on public.activity_events for select to authenticated
  using (private.is_member(club_id));

create policy "see own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
