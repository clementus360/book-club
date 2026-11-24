-- Deleting an account. The app deletes the auth user (which cascades to the
-- profile and everything personal); this makes that work for anyone, however
-- their clubs stand, and from the dashboard too.
--
-- Before the profile goes, each of their clubs is settled:
--   - a club with no one else in it is closed, as close_club would;
--   - a club where they are the only administrator passes to the member who
--     has been there longest, so the last-admin rule still holds.
-- What they wrote for a club stays in its record without their name, as it
-- does today when an account is removed (those columns are on delete set null).

create function private.before_profile_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_heir uuid;
begin
  for m in
    select club_id, role from public.club_memberships where user_id = old.id order by club_id
  loop
    -- The same lock protect_last_admin takes, so role changes cannot race this.
    perform 1 from public.clubs where id = m.club_id for update;
    if not exists (select 1 from public.club_memberships where club_id = m.club_id and user_id <> old.id) then
      delete from public.clubs where id = m.club_id;
    elsif m.role = 'admin' and not exists (
      select 1 from public.club_memberships where club_id = m.club_id and role = 'admin' and user_id <> old.id
    ) then
      select user_id into v_heir from public.club_memberships
      where club_id = m.club_id and user_id <> old.id
      order by joined_at, id limit 1;
      update public.club_memberships set role = 'admin' where club_id = m.club_id and user_id = v_heir;
    end if;
  end loop;
  return old;
end $$;
revoke execute on function private.before_profile_delete() from public, anon, authenticated;

create trigger profiles_before_delete before delete on public.profiles
  for each row execute function private.before_profile_delete();
