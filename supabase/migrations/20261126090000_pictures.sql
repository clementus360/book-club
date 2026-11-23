-- Profile pictures: uploaded (small, shrunk in the browser) or taken from Google.

-- Pictures now come from Supabase Storage or Google. A local address is allowed
-- only so the tests, which run on plain http, can store one.
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (
  char_length(avatar_url) <= 1000
  and (avatar_url ~ '^https://' or avatar_url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/'));

-- Supabase provides the storage schema. Plain Postgres (outside the tests' own
-- stand-in) does not, and then there is simply nowhere to upload to.
do $do$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'No storage schema here: skipping the pictures bucket.';
    return;
  end if;

  -- Public: each picture has an unguessable address, as profile pictures
  -- usually do. 200 KB is far more than a 256-pixel square needs.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  create function private.own_pictures() returns int
  language sql stable security definer set search_path = '' as $f$
    select count(*)::int from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text;
  $f$;
  revoke execute on function private.own_pictures() from public, anon;
  grant execute on function private.own_pictures() to authenticated;

  -- Everyone writes only inside a folder named after themselves, and keeps at
  -- most three files there (the old one lingers a moment while it is replaced).
  create policy "pictures: add your own" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
                and private.own_pictures() < 3);
  create policy "pictures: list your own" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy "pictures: remove your own" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
end $do$;
