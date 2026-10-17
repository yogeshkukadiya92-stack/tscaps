begin;
create table if not exists public.reelstudio_user_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 cloud_enabled boolean not null default true,
 project_limit integer check(project_limit between 0 and 100000),
 storage_limit_bytes bigint check(storage_limit_bytes between 0 and 10995116277760),
 updated_at timestamptz not null default now()
);
create table if not exists public.reelstudio_usage_events (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('export_completed','export_failed','preprocessing_completed','transcription_completed')),
 created_at timestamptz not null default now()
);
create index if not exists reelstudio_usage_owner_date on public.reelstudio_usage_events(user_id,created_at desc);
create table if not exists public.reelstudio_admin_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null, target_id uuid not null,
 created_at timestamptz not null default now(), details jsonb not null
);
alter table public.reelstudio_user_limits enable row level security;
alter table public.reelstudio_usage_events enable row level security;
alter table public.reelstudio_admin_audit enable row level security;
revoke all on public.reelstudio_user_limits,public.reelstudio_usage_events,public.reelstudio_admin_audit from public,anon,authenticated;

create or replace function public.reelstudio_record_usage(event_id uuid,event_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if event_kind not in ('export_completed','export_failed','preprocessing_completed','transcription_completed') then raise exception 'Invalid event'; end if;
 -- Counters are informational browser reports, never payment or entitlement inputs.
 insert into public.reelstudio_usage_events(id,user_id,kind) values(event_id,auth.uid(),event_kind) on conflict(id) do nothing;
end; $$;

create or replace function public.reelstudio_enforce_limits() returns trigger
language plpgsql security definer set search_path='' as $$
declare limit_owner_id uuid; limits public.reelstudio_user_limits; used numeric; incoming numeric;
begin
 if tg_table_schema='storage' then
   if new.bucket_id <> 'reelstudio-videos' then return new; end if;
   begin limit_owner_id := split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then return new; end;
 else limit_owner_id := new.user_id;
   -- Recovery and deletion stay available when cloud writes are disabled.
   if new.deleted_at is not null then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(limit_owner_id::text,78421));
 select * into limits from public.reelstudio_user_limits where user_id=limit_owner_id;
 if not found then return new; end if;
 if not limits.cloud_enabled then raise exception 'Cloud saving is paused for your account. Contact the administrator.' using errcode='42501'; end if;
 if tg_table_schema='public' then
   if limits.project_limit is not null then
     select count(*) into used from public.reelstudio_projects where user_id=limit_owner_id and deleted_at is null and id<>new.id;
     if used>=limits.project_limit and (tg_op='INSERT' or old.deleted_at is not null) then raise exception 'Your project limit has been reached. Contact the administrator.' using errcode='23514'; end if;
   end if;
 elsif limits.storage_limit_bytes is not null then
   incoming := case when new.metadata->>'size' ~ '^[0-9]+$' then (new.metadata->>'size')::numeric else 0 end;
   select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0) into used
   from storage.objects where bucket_id='reelstudio-videos' and split_part(name,'/',1)=limit_owner_id::text and id<>new.id;
   if used+incoming>limits.storage_limit_bytes then raise exception 'Your cloud storage limit has been reached. Remove unused videos or contact the administrator.' using errcode='23514'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists reelstudio_project_limits on public.reelstudio_projects;
create trigger reelstudio_project_limits before insert or update on public.reelstudio_projects for each row execute function public.reelstudio_enforce_limits();
drop trigger if exists reelstudio_storage_limits on storage.objects;
create trigger reelstudio_storage_limits before insert or update on storage.objects for each row execute function public.reelstudio_enforce_limits();

create or replace function public.reelstudio_admin_save_limits(target_id uuid,cloud_enabled boolean,project_limit integer,storage_limit_bytes bigint,credit_delta integer default 0,reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare before_value jsonb; after_value jsonb; balance_value integer;
begin
 if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if target_id=auth.uid() then raise exception 'Ask another administrator to change your account limits'; end if;
 if not exists(select 1 from auth.users where id=target_id) then raise exception 'Account not found'; end if;
 if char_length(trim(reason))<3 or char_length(reason)>500 then raise exception 'Enter a reason (3–500 characters)'; end if;
 if credit_delta is null or abs(credit_delta::bigint)>100000 then raise exception 'Credit adjustment out of range'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_id::text,78421));
 select to_jsonb(l) into before_value from public.reelstudio_user_limits l where user_id=target_id;
 insert into public.reelstudio_user_limits as l(user_id,cloud_enabled,project_limit,storage_limit_bytes)
 values(target_id,cloud_enabled,project_limit,storage_limit_bytes)
 on conflict(user_id) do update set cloud_enabled=excluded.cloud_enabled,project_limit=excluded.project_limit,storage_limit_bytes=excluded.storage_limit_bytes,updated_at=now();
 if credit_delta<>0 then
   if to_regclass('public.reelstudio_credit_wallets') is null then raise exception 'AI credits are not configured'; end if;
   execute 'insert into public.reelstudio_credit_wallets(user_id,balance) values($1,0) on conflict do nothing' using target_id;
   execute 'update public.reelstudio_credit_wallets set balance=balance+$2 where user_id=$1 and balance::bigint+$2 between 0 and 2147483647 returning balance' into balance_value using target_id,credit_delta;
   if balance_value is null then raise exception 'Adjustment would make the credit balance invalid'; end if;
 end if;
 select to_jsonb(l) into after_value from public.reelstudio_user_limits l where user_id=target_id;
 insert into public.reelstudio_admin_audit(actor_id,target_id,details) values(auth.uid(),target_id,jsonb_build_object('before',before_value,'after',after_value,'credit_delta',credit_delta,'credit_balance',balance_value,'reason',trim(reason)));
end; $$;

create or replace function public.reelstudio_admin_usage(search text default '',page_number integer default 0,sort_by text default 'joined',account_filter text default 'all') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; credits jsonb := '{}'::jsonb; billing jsonb := '{}'::jsonb;
begin
 if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if to_regclass('public.reelstudio_credit_wallets') is not null then
   execute 'select coalesce(jsonb_object_agg(user_id,balance),''{}''::jsonb) from public.reelstudio_credit_wallets' into credits;
 end if;
 if to_regclass('public.reelstudio_billing_accounts') is not null and to_regclass('public.reelstudio_subscriptions') is not null then
   execute $q$select coalesce(jsonb_object_agg(a.user_id,jsonb_build_object('trial_ends_at',a.trial_ends_at,'paid_until',(select max(s.paid_until) from public.reelstudio_subscriptions s where s.user_id=a.user_id),'subscription_status',(select s.status from public.reelstudio_subscriptions s where s.user_id=a.user_id order by s.checked_at desc limit 1))),'{}'::jsonb) from public.reelstudio_billing_accounts a$q$ into billing;
 end if;
 with projects as (
   select user_id,count(*) filter(where deleted_at is null) as projects,count(*) filter(where deleted_at is not null) as deleted_projects,
   count(*) filter(where deleted_at is null and has_document) as captioned_projects,
   coalesce(sum(case when deleted_at is null and video->>'duration' ~ '^[0-9]+([.][0-9]+)?$' then (video->>'duration')::numeric else 0 end),0) as video_seconds,
   max(updated_at) as last_project_at from public.reelstudio_projects group by user_id
 ), files as (
   select split_part(name,'/',1) as owner,count(*) as stored_videos,
   coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0) as storage_bytes
   from storage.objects where bucket_id='reelstudio-videos' group by 1
 ), events as (
   select user_id,count(*) filter(where kind='export_completed') as exports,count(*) filter(where kind='export_failed') as export_failures,
   count(*) filter(where kind='preprocessing_completed') as processed_videos,count(*) filter(where kind='transcription_completed') as transcriptions,max(created_at) as last_event_at from public.reelstudio_usage_events group by user_id
 ), accounts as (
   select u.id,u.email,coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name','') as display_name,u.created_at,u.last_sign_in_at,
   exists(select 1 from public.reelstudio_admins a where a.user_id=u.id) as is_admin,
   coalesce(p.projects,0) as projects,coalesce(p.deleted_projects,0) as deleted_projects,coalesce(p.captioned_projects,0) as captioned_projects,coalesce(p.video_seconds,0) as video_seconds,
   coalesce(f.stored_videos,0) as stored_videos,coalesce(f.storage_bytes,0) as storage_bytes,
   coalesce(e.exports,0) as exports,coalesce(e.export_failures,0) as export_failures,coalesce(e.processed_videos,0) as processed_videos,coalesce(e.transcriptions,0) as transcriptions,
   greatest(u.last_sign_in_at,p.last_project_at,e.last_event_at) as last_active_at,
   coalesce(l.cloud_enabled,true) as cloud_enabled,l.project_limit,l.storage_limit_bytes,
   credits->u.id::text as credit_balance,billing->u.id::text as billing
   from auth.users u left join projects p on p.user_id=u.id left join files f on f.owner=u.id::text left join events e on e.user_id=u.id left join public.reelstudio_user_limits l on l.user_id=u.id
 ), filtered as (
   select * from accounts a where (a.email ilike '%'||left(search,200)||'%' or a.display_name ilike '%'||left(search,200)||'%')
   and (account_filter='all' or (account_filter='admins' and is_admin) or (account_filter='paused' and not cloud_enabled) or (account_filter='active' and last_active_at>now()-interval '7 days'))
 ), paged as (
   select * from filtered order by
   case when sort_by='storage' then storage_bytes end desc,
   case when sort_by='projects' then projects end desc,
   case when sort_by='activity' then last_active_at end desc nulls last,
   created_at desc,id limit 25 offset greatest(page_number,0)::bigint*25
 )
 select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total_count',(select count(*) from filtered),
 'summary',(select jsonb_build_object('users',count(*),'projects',coalesce(sum(projects),0),'storage_bytes',coalesce(sum(storage_bytes),0),'active_users',count(*) filter(where last_active_at>now()-interval '7 days'),'exports',coalesce(sum(exports),0)) from accounts),
 'credits_available',to_regclass('public.reelstudio_credit_wallets') is not null,'billing_available',to_regclass('public.reelstudio_billing_accounts') is not null,
 'server_now',now(),'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select l.created_at,u.email as actor,t.email as target,l.details from public.reelstudio_admin_audit l left join auth.users u on u.id=l.actor_id left join auth.users t on t.id=l.target_id order by l.id desc limit 20) a),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.reelstudio_record_usage(uuid,text),public.reelstudio_admin_save_limits(uuid,boolean,integer,bigint,integer,text),public.reelstudio_admin_usage(text,integer,text,text),public.reelstudio_enforce_limits() from public,anon,authenticated;
grant execute on function public.reelstudio_record_usage(uuid,text),public.reelstudio_admin_save_limits(uuid,boolean,integer,bigint,integer,text),public.reelstudio_admin_usage(text,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
