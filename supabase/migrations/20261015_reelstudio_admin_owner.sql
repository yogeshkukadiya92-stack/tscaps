-- Run after 20261015_reelstudio_admin.sql from the trusted SQL editor.
-- Only grants access to the existing account; signup cannot self-assign this role.
begin;
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users
  where lower(email) = 'yogeshkukadiya92@gmail.com'
    and email_confirmed_at is not null;
  if owner_id is null then
    raise exception 'Confirmed account yogeshkukadiya92@gmail.com not found. Sign up or confirm the account before rerunning this migration.';
  end if;
  insert into public.reelstudio_admins(user_id) values (owner_id)
  on conflict (user_id) do nothing;
end;
$$;
commit;
