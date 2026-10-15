begin;
-- Storage metadata is read-only here: physical files are removed via Storage API.
create or replace function public.reelstudio_expired_videos()
returns table (name text)
language sql stable security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'reelstudio-videos'
    and o.created_at <= now() - interval '48 hours'
  order by o.created_at, o.name
  limit 500;
$$;
revoke all on function public.reelstudio_expired_videos() from public, anon, authenticated;
grant execute on function public.reelstudio_expired_videos() to service_role;
notify pgrst, 'reload schema';
commit;
