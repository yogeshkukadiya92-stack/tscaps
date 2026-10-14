begin;
create table if not exists public.reelstudio_projects (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  has_document boolean not null default false,
  thumbnail_data text,
  payload jsonb not null,
  video jsonb not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);
create index if not exists reelstudio_projects_owner_updated_idx
  on public.reelstudio_projects (user_id, updated_at desc) where deleted_at is null;
alter table public.reelstudio_projects enable row level security;
revoke all on public.reelstudio_projects from anon;
grant select, insert, update, delete on public.reelstudio_projects to authenticated;
drop policy if exists reelstudio_projects_owner on public.reelstudio_projects;
create policy reelstudio_projects_owner on public.reelstudio_projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('reelstudio-videos', 'reelstudio-videos', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists reelstudio_videos_owner on storage.objects;
create policy reelstudio_videos_owner on storage.objects for all to authenticated
  using (bucket_id = 'reelstudio-videos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'reelstudio-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
notify pgrst, 'reload schema';
commit;
