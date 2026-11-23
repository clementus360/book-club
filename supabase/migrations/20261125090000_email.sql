-- Email for the milestones that matter, and a clock that keeps deadlines moving
-- when nobody happens to be looking.

alter table public.profiles add column email_updates boolean not null default true;
grant update (email_updates) on public.profiles to authenticated;

-- Which notifications are worth an email. Everything else stays in the app.
create function private.emails_for(p_type text) returns boolean
language sql immutable set search_path = '' as $$
  select p_type in (
    'nominations_opened', 'nominations_reopened', 'nominations_closed',
    'voting_opened', 'voting_reopened', 'runoff_opened', 'decision_needed', 'book_selected', 'cycle_cancelled',
    'meeting_created', 'meeting_updated', 'meeting_cancelled', 'poll_opened');
$$;

-- One row per email owed. Deleting the notification (a withdrawn poll, someone
-- leaving the club) takes the email with it if it has not gone yet.
create table private.email_outbox (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text
);
create index email_outbox_pending_idx on private.email_outbox (created_at) where sent_at is null and failed_at is null;

create function private.queue_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.emails_for(new.type) and exists (select 1 from public.profiles where id = new.user_id and email_updates) then
    insert into private.email_outbox (notification_id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger notifications_email after insert on public.notifications
  for each row execute function private.queue_email();

-- Where the app is, and the secret it is called with. The secret is made here
-- and never leaves the database except in that call.
create table private.settings (key text primary key, value text not null);
insert into private.settings (key, value)
values ('email_secret', encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'));

create function private.set_app_url(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_url !~ '^https?://[^/\s]+$' then
    raise exception 'Give the address without a path or trailing slash, like https://books.example.com';
  end if;
  insert into private.settings (key, value) values ('app_url', p_url)
  on conflict (key) do update set value = excluded.value;
end $$;

-- For the server, with the secret key only.
create function public.check_email_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.settings where key = 'email_secret' and value = p_secret and char_length(p_secret) = 64);
$$;

-- Hands out emails to send, at most once every ten minutes each, five tries in
-- all, and nothing older than two days.
create function public.claim_emails(p_limit int) returns jsonb
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
      'club_id', c.id, 'club', c.name, 'timezone', c.timezone, 'actor', a.display_name, 'reference_id', n.reference_id,
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

-- p_failed: {"<notification id>": "what went wrong"}
create function public.finish_emails(p_sent uuid[], p_failed jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.email_outbox set sent_at = now(), last_error = null where notification_id = any (coalesce(p_sent, '{}'));
  update private.email_outbox o set last_error = left(f.value, 500)
  from jsonb_each_text(coalesce(p_failed, '{}'::jsonb)) f where o.notification_id::text = f.key;
end $$;

-- From a signed link in an email, so no sign-in is needed.
create function public.set_email_updates(p_user uuid, p_on boolean) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set email_updates = p_on where id = p_user;
$$;

-- --------------------------------------------------------------------- clock

-- Every deadline that has passed, in every club, then a nudge to the app if
-- there is email to send. Run each minute by pg_cron where it is available.
create function private.tick() returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_url text; v_secret text;
begin
  for v_id in
    select id from public.reading_cycles c where
         (c.status = 'scheduled' and now() >= c.nomination_opens_at)
      or (c.status = 'nominating' and now() >= c.nomination_closes_at)
      or (c.status = 'nominations_closed' and now() >= c.voting_opens_at and private.active_nomination_count(c.id) >= 2)
      or (c.status = 'voting' and now() >= c.voting_closes_at)
      or (c.status = 'runoff' and now() >= c.runoff_closes_at)
  loop
    begin
      perform private.sync_cycle(v_id);
    exception when others then
      raise warning 'commonplace: could not bring cycle % up to date: %', v_id, sqlerrm;
    end;
  end loop;

  if to_regnamespace('net') is null or not exists (
    select 1 from private.email_outbox
    where sent_at is null and failed_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes')
  ) then return; end if;
  select value into v_url from private.settings where key = 'app_url';
  select value into v_secret from private.settings where key = 'email_secret';
  if v_url is null then return; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
  using v_url || '/api/email/send',
        jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
        '{}'::jsonb;
end $$;

-- Supabase has pg_cron and pg_net. A plain Postgres (as in the tests) may not,
-- and then the app simply keeps deadlines as it always has, when pages load.
do $$
begin
  if current_setting('shared_preload_libraries', true) ~ 'pg_cron'
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.unschedule('commonplace-tick') where exists (select 1 from cron.job where jobname = 'commonplace-tick');
    perform cron.schedule('commonplace-tick', '* * * * *', 'select private.tick()');
  else
    raise notice 'pg_cron is not available here, so deadlines are kept when pages load.';
  end if;
end $$;

-- ------------------------------------------------------------------ privileges

revoke all on private.email_outbox, private.settings from public, anon, authenticated;
revoke execute on function
  private.emails_for(text), private.queue_email(), private.set_app_url(text), private.tick(),
  public.check_email_secret(text), public.claim_emails(int), public.finish_emails(uuid[], jsonb), public.set_email_updates(uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.check_email_secret(text), public.claim_emails(int), public.finish_emails(uuid[], jsonb), public.set_email_updates(uuid, boolean)
  to service_role;
