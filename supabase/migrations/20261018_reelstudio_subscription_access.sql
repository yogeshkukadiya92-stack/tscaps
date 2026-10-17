-- Apply after the admin usage migration. No user receives an override by default.
begin;
create table if not exists public.reelstudio_manual_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null check(mode in ('subscription','complimentary','blocked')),
 expires_at timestamptz,
 updated_at timestamptz not null default now(),
 check(mode='complimentary' or expires_at is null)
);
alter table public.reelstudio_manual_access enable row level security;
revoke all on public.reelstudio_manual_access from public,anon,authenticated;

create or replace function public.reelstudio_admin_set_access(target_id uuid,access_mode text,access_until timestamptz default null,reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare before_value jsonb; after_value jsonb;
begin
 if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if target_id=auth.uid() then raise exception 'You cannot change your own access'; end if;
 if not exists(select 1 from auth.users where id=target_id) then raise exception 'Account not found'; end if;
 if exists(select 1 from public.reelstudio_admins where user_id=target_id) then raise exception 'Administrators already have access. Manage their role separately.'; end if;
 if access_mode not in ('subscription','complimentary','blocked') or access_mode is null then raise exception 'Invalid access mode'; end if;
 if access_mode<>'complimentary' and access_until is not null then raise exception 'Only complimentary access can have an expiry'; end if;
 if access_until is not null and (access_until<=now() or access_until>now()+interval '10 years') then raise exception 'Choose a future expiry within 10 years'; end if;
 if char_length(trim(reason))<3 or char_length(reason)>500 or reason is null then raise exception 'Enter a reason (3–500 characters)'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_id::text,78421));
 select to_jsonb(a) into before_value from public.reelstudio_manual_access a where user_id=target_id;
 insert into public.reelstudio_manual_access as a(user_id,mode,expires_at) values(target_id,access_mode,access_until)
 on conflict(user_id) do update set mode=excluded.mode,expires_at=excluded.expires_at,updated_at=now();
 select to_jsonb(a) into after_value from public.reelstudio_manual_access a where user_id=target_id;
 insert into public.reelstudio_admin_audit(actor_id,target_id,details) values(auth.uid(),target_id,jsonb_build_object('action','access_override','before',before_value,'after',after_value,'reason',trim(reason)));
end; $$;

create or replace function public.reelstudio_has_access() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare overrides public.reelstudio_manual_access; entitled boolean;
begin
 if auth.uid() is null then return false; end if;
 if public.reelstudio_is_admin() then return true; end if;
 select * into overrides from public.reelstudio_manual_access where user_id=auth.uid();
 if overrides.mode='blocked' then return false; end if;
 if overrides.mode='complimentary' and (overrides.expires_at is null or overrides.expires_at>now()) then return true; end if;
 -- Installations without billing keep their existing open access policy.
 if to_regclass('public.reelstudio_billing_accounts') is null or to_regclass('public.reelstudio_subscriptions') is null then return true; end if;
 execute 'select exists(select 1 from public.reelstudio_billing_accounts a where a.user_id=$1 and (a.trial_ends_at>now() or exists(select 1 from public.reelstudio_subscriptions s where s.user_id=a.user_id and s.paid_until>now())))' into entitled using auth.uid();
 return entitled;
end; $$;

-- Enforce explicit blocks for cloud writes even when paid billing is disabled.
create or replace function public.reelstudio_enforce_manual_access() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_owner uuid;
begin
 if tg_table_schema='storage' then
  if new.bucket_id<>'reelstudio-videos' then return new; end if;
  begin target_owner:=split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then return new; end;
 else
  target_owner:=new.user_id;
  if new.deleted_at is not null then return new; end if;
 end if;
 if exists(select 1 from public.reelstudio_manual_access a where a.user_id=target_owner and a.mode='blocked')
 and not exists(select 1 from public.reelstudio_admins where user_id=target_owner) then
  raise exception 'Cloud access is paused for this account. Contact the administrator.' using errcode='42501';
 end if;
 return new;
end; $$;
drop trigger if exists reelstudio_manual_project_access on public.reelstudio_projects;
create trigger reelstudio_manual_project_access before insert or update on public.reelstudio_projects for each row execute function public.reelstudio_enforce_manual_access();
drop trigger if exists reelstudio_manual_storage_access on storage.objects;
create trigger reelstudio_manual_storage_access before insert or update on storage.objects for each row execute function public.reelstudio_enforce_manual_access();

create or replace function public.reelstudio_billing_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; overrides public.reelstudio_manual_access; configured boolean; administrator boolean; granted boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 configured:=to_regclass('public.reelstudio_billing_accounts') is not null and to_regclass('public.reelstudio_subscriptions') is not null;
 administrator:=public.reelstudio_is_admin();
 select * into overrides from public.reelstudio_manual_access where user_id=auth.uid();
 granted:=coalesce(overrides.mode='complimentary' and (overrides.expires_at is null or overrides.expires_at>now()),false);
 result:=jsonb_build_object('trial_ends_at',now(),'paid_until',null,'subscription',null);
 if configured then
  execute $q$select jsonb_build_object('trial_ends_at',a.trial_ends_at,'paid_until',(select max(s.paid_until) from public.reelstudio_subscriptions s where s.user_id=$1),
   'subscription',(select jsonb_build_object('id',s.id,'status',s.status,'current_end',s.current_end,'billing_cycle',coalesce(to_jsonb(s)->>'billing_cycle','monthly'),'cancel_at_cycle_end',s.cancel_at_cycle_end) from public.reelstudio_subscriptions s where s.user_id=$1 order by s.checked_at desc limit 1))
   from public.reelstudio_billing_accounts a where a.user_id=$1$q$ into result using auth.uid();
 end if;
 return coalesce(result,'{}'::jsonb)||jsonb_build_object('server_now',now(),'billing_configured',configured,'is_admin',administrator,
  'allowed',case when configured then public.reelstudio_has_access() else administrator or granted end,
  'access_blocked',coalesce(overrides.mode='blocked' and not administrator,false),
  'complimentary_unlimited',granted and overrides.expires_at is null,'complimentary_until',case when granted then overrides.expires_at else null end);
end; $$;

-- Keep the paginated aggregate implementation and enrich only the returned page.
do $$ begin
 if to_regprocedure('public.reelstudio_admin_usage_base(text,integer,text,text)') is null then
  alter function public.reelstudio_admin_usage(text,integer,text,text) rename to reelstudio_admin_usage_base;
 end if;
end; $$;
create or replace function public.reelstudio_admin_usage(search text default '',page_number integer default 0,sort_by text default 'joined',account_filter text default 'all') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; enriched jsonb:='[]'::jsonb; account jsonb; overrides jsonb; subscriptions jsonb;
begin
 if not public.reelstudio_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 result:=public.reelstudio_admin_usage_base(search,page_number,sort_by,account_filter);
 for account in select value from jsonb_array_elements(result->'users') loop
  select jsonb_build_object('mode',a.mode,'expires_at',a.expires_at,'updated_at',a.updated_at) into overrides from public.reelstudio_manual_access a where user_id=(account->>'id')::uuid;
  subscriptions:='[]'::jsonb;
  if to_regclass('public.reelstudio_subscriptions') is not null then
   execute $q$select coalesce(jsonb_agg(v),'[]'::jsonb) from (select jsonb_build_object('id',s.id,'status',s.status,'billing_cycle',coalesce(to_jsonb(s)->>'billing_cycle','monthly'),'paid_until',s.paid_until,'current_end',s.current_end,'cancel_at_cycle_end',s.cancel_at_cycle_end,'checked_at',s.checked_at) as v from public.reelstudio_subscriptions s where s.user_id=$1 order by s.checked_at desc limit 10) subscriptions$q$ into subscriptions using (account->>'id')::uuid;
  end if;
  enriched:=enriched||jsonb_build_array(account||jsonb_build_object('access',coalesce(overrides,jsonb_build_object('mode','subscription','expires_at',null)),'subscriptions',subscriptions));
 end loop;
 return result||jsonb_build_object('users',enriched);
end; $$;

-- Service-only, checked audit hook for provider operations. No browser can impersonate an actor.
create or replace function public.reelstudio_log_subscription_action(actor uuid,target uuid,subscription_id text,operation text,reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.reelstudio_admins where user_id=actor) then raise exception 'Administrator access required'; end if;
 if operation not in ('subscription_refresh','subscription_cancel_requested','subscription_cancelled') then raise exception 'Invalid audit operation'; end if;
 insert into public.reelstudio_admin_audit(actor_id,target_id,details) values(actor,target,jsonb_build_object('action',operation,'subscription_id',subscription_id,'reason',reason));
end; $$;
revoke all on function public.reelstudio_admin_usage_base(text,integer,text,text),public.reelstudio_admin_set_access(uuid,text,timestamptz,text),public.reelstudio_has_access(),public.reelstudio_billing_status(),public.reelstudio_enforce_manual_access(),public.reelstudio_admin_usage(text,integer,text,text),public.reelstudio_log_subscription_action(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reelstudio_admin_set_access(uuid,text,timestamptz,text),public.reelstudio_has_access(),public.reelstudio_billing_status(),public.reelstudio_admin_usage(text,integer,text,text) to authenticated;
grant execute on function public.reelstudio_log_subscription_action(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
