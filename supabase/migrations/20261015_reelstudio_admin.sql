begin;
create table public.reelstudio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.reelstudio_admins enable row level security;
revoke all on public.reelstudio_admins from anon, authenticated;

create function public.reelstudio_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.reelstudio_admins where user_id = auth.uid());
$$;
create function public.reelstudio_admin_users(search text default '', page_number integer default 0)
returns table(id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, is_admin boolean, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query select u.id, u.email::text, coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', ''), u.created_at, u.last_sign_in_at,
    exists(select 1 from public.reelstudio_admins a where a.user_id = u.id), count(*) over()
  from auth.users u
  where u.email ilike '%' || left(search, 200) || '%' or coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', '') ilike '%' || left(search, 200) || '%'
  order by u.created_at desc, u.id limit 25 offset greatest(page_number, 0)::bigint * 25;
end;
$$;
create function public.reelstudio_admin_update_user(target_id uuid, display_name text, make_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize role changes so concurrent requests cannot remove the last administrator.
  lock table public.reelstudio_admins in exclusive mode;
  if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if target_id = auth.uid() then raise exception 'You cannot change your own account here'; end if;
  if char_length(trim(display_name)) > 100 then raise exception 'Name must be 100 characters or less'; end if;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', trim(display_name)) where id = target_id;
  if not found then raise exception 'User not found'; end if;
  if make_admin then insert into public.reelstudio_admins(user_id) values(target_id) on conflict do nothing;
  else delete from public.reelstudio_admins where user_id = target_id; end if;
end;
$$;
revoke all on function public.reelstudio_is_admin(), public.reelstudio_admin_users(text, integer), public.reelstudio_admin_update_user(uuid, text, boolean) from public, anon;
grant execute on function public.reelstudio_is_admin(), public.reelstudio_admin_users(text, integer), public.reelstudio_admin_update_user(uuid, text, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
