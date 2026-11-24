-- Hardening before launch.

-- --------------------------------------------------- adding search results

-- Choosing a search result adds it to the shared catalogue through the secret
-- key, where no per-person limit applied. The server asks this first.
create function public.consume_import_quota() returns boolean
language sql security definer set search_path = '' as $$
  select private.allow('book_import', 60, interval '1 hour');
$$;
revoke execute on function public.consume_import_quota() from public, anon;
grant execute on function public.consume_import_quota() to authenticated;

-- ------------------------------------------- manual entries, once chosen

-- Once a club has voted on something, or chosen it, its details are what
-- members agreed to. Whoever typed it in can no longer rewrite it.
create function private.book_is_settled(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reading_cycles where book_id = p_book_id)
      or exists (
        select 1 from public.nominations n join public.reading_cycles c on c.id = n.cycle_id
        where n.book_id = p_book_id and n.withdrawn_at is null
          and c.status not in ('scheduled', 'nominating', 'cancelled'));
$$;
revoke execute on function private.book_is_settled(uuid) from public, anon, authenticated;

alter function public.update_manual_book(uuid, jsonb) rename to update_manual_book_fields;
alter function public.update_manual_book_fields(uuid, jsonb) set schema private;
revoke execute on function private.update_manual_book_fields(uuid, jsonb) from public, anon, authenticated;

create function public.update_manual_book(p_book_id uuid, p_book jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.book_is_settled(p_book_id) then
    perform private.fail('A club has already voted on or chosen this, so its details can no longer be changed.');
  end if;
  perform private.update_manual_book_fields(p_book_id, p_book);
end $$;
revoke execute on function public.update_manual_book(uuid, jsonb) from public, anon;
grant execute on function public.update_manual_book(uuid, jsonb) to authenticated;

create or replace function public.can_edit_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.books b join private.book_origins o on o.book_id = b.id
    where b.id = p_book_id and b.metadata_source = 'manual' and o.created_by = auth.uid()
  ) and not private.book_is_settled(p_book_id);
$$;

-- --------------------------------------------------------- profile pictures

-- Only an upload to the person's own folder, or a picture Google gave. The
-- host of an upload is checked where pictures are shown (the page's CSP).
alter table public.profiles drop constraint profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (
  char_length(avatar_url) <= 1000
  and (
    avatar_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/\S+$'
    or avatar_url ~ ('^(https://[a-z0-9.-]+|http://(localhost|127\.0\.0\.1)(:[0-9]+)?)/storage/v1/object/public/avatars/'
                     || id::text || '/[A-Za-z0-9-]+\.(webp|jpg|png)$')
  )) not valid;

-- --------------------------------------------------------------------- email

-- The email secret is sent to this address, so it must be encrypted, except
-- on this computer.
create or replace function private.set_app_url(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_url !~ '^(https://[^/\s]+|http://(localhost|127\.0\.0\.1)(:[0-9]+)?)$' then
    raise exception 'Give the https:// address without a path or trailing slash, like https://books.example.com';
  end if;
  insert into private.settings (key, value) values ('app_url', p_url)
  on conflict (key) do update set value = excluded.value;
end $$;

-- When the email service says "not now" (its rate or daily limit), what was
-- handed out goes back without counting as an attempt.
create function public.release_emails(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update private.email_outbox set claimed_at = null, attempts = greatest(attempts - 1, 0)
  where notification_id = any (coalesce(p_ids, '{}')) and sent_at is null;
$$;
revoke execute on function public.release_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.release_emails(uuid[]) to service_role;
