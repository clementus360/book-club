-- People who sign up with Google arrive with full_name rather than
-- display_name. Their Google picture is deliberately not copied: showing it to
-- a club should be their choice.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(left(new.raw_user_meta_data ->> 'display_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'name', 80)), ''),
      'Reader'
    )
  );
  return new;
end $$;
