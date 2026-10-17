begin;
create table public.reelstudio_credit_wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 balance integer not null default 0 check(balance >= 0)
);
create table public.reelstudio_credit_orders (
 id text primary key, user_id uuid not null references auth.users(id),
 amount integer not null check(amount > 0), credits integer not null check(credits > 0),
 credited boolean not null default false, created_at timestamptz not null default now()
);
create table public.reelstudio_ai_videos (
 user_id uuid not null references auth.users(id), project_id uuid not null, source_version text not null,
 unlocked boolean not null default false, cost integer not null default 0 check(cost>=0), token uuid, expires_at timestamptz,
 request_id uuid, plan jsonb, primary key(user_id, project_id, source_version)
);
alter table public.reelstudio_credit_wallets enable row level security;
alter table public.reelstudio_credit_orders enable row level security;
alter table public.reelstudio_ai_videos enable row level security;
revoke all on public.reelstudio_credit_wallets, public.reelstudio_credit_orders, public.reelstudio_ai_videos from anon, authenticated;
grant select on public.reelstudio_credit_wallets to authenticated;
create policy credit_wallet_read on public.reelstudio_credit_wallets for select to authenticated using(user_id=auth.uid());
grant all on public.reelstudio_credit_wallets, public.reelstudio_credit_orders, public.reelstudio_ai_videos to service_role;

create function public.reelstudio_credit_payment(order_id text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.reelstudio_credit_orders;
begin
 select * into o from public.reelstudio_credit_orders where id=order_id for update;
 if not found then raise exception 'Unknown order'; end if;
 if o.credited then return; end if;
 insert into public.reelstudio_credit_wallets(user_id,balance) values(o.user_id,o.credits)
 on conflict(user_id) do update set balance=reelstudio_credit_wallets.balance+excluded.balance;
 update public.reelstudio_credit_orders set credited=true where id=order_id;
end; $$;

create function public.reelstudio_ai_reserve(owner_id uuid, video_id uuid, attempt_id uuid, source_hash text, credit_cost integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare version text; v public.reelstudio_ai_videos;
begin
 select source_hash into version from public.reelstudio_projects where user_id=owner_id and id=video_id and deleted_at is null;
 if credit_cost < 1 or credit_cost > 720 or source_hash !~ '^[a-f0-9]{64}:(standard|high)$' then raise exception 'Invalid quote'; end if;
 if version is null then return jsonb_build_object('error','project'); end if;
 insert into public.reelstudio_credit_wallets(user_id) values(owner_id) on conflict do nothing;
 perform 1 from public.reelstudio_credit_wallets where user_id=owner_id for update;
 insert into public.reelstudio_ai_videos(user_id,project_id,source_version) values(owner_id,video_id,version) on conflict do nothing;
 select * into v from public.reelstudio_ai_videos where user_id=owner_id and project_id=video_id and source_version=version for update;
 if v.request_id=attempt_id and v.plan is not null then return jsonb_build_object('cached',v.plan); end if;
 if v.token is not null and v.expires_at>now() then return jsonb_build_object('error','busy'); end if;
 -- A worker that disappeared before completion must not strand a credit.
 if v.token is not null and not v.unlocked then update public.reelstudio_credit_wallets set balance=balance+v.cost where user_id=owner_id; end if;
 if not v.unlocked then
   update public.reelstudio_credit_wallets set balance=balance-credit_cost where user_id=owner_id and balance>=credit_cost;
   if not found then
     update public.reelstudio_ai_videos set token=null,expires_at=null where user_id=owner_id and project_id=video_id and source_version=version;
     return jsonb_build_object('error','credits');
   end if;
 end if;
 update public.reelstudio_ai_videos set token=attempt_id, cost=credit_cost, expires_at=now()+interval '2 minutes' where user_id=owner_id and project_id=video_id and source_version=version;
 return jsonb_build_object('version',version,'token',attempt_id);
end; $$;

create function public.reelstudio_ai_finish(owner_id uuid, video_id uuid, version text, attempt_id uuid, result jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare v public.reelstudio_ai_videos;
begin
 perform 1 from public.reelstudio_credit_wallets where user_id=owner_id for update;
 select * into v from public.reelstudio_ai_videos where user_id=owner_id and project_id=video_id and source_version=version for update;
 if not found or v.token is distinct from attempt_id then return false; end if;
 if result is null and not v.unlocked then update public.reelstudio_credit_wallets set balance=balance+v.cost where user_id=owner_id; end if;
 update public.reelstudio_ai_videos set token=null,expires_at=null,
 unlocked=unlocked or result is not null, request_id=case when result is null then request_id else attempt_id end,
 plan=coalesce(result,plan) where user_id=owner_id and project_id=video_id and source_version=version;
 return true;
end; $$;
revoke all on function public.reelstudio_credit_payment(text),public.reelstudio_ai_reserve(uuid,uuid,uuid,text,integer),public.reelstudio_ai_finish(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reelstudio_credit_payment(text),public.reelstudio_ai_reserve(uuid,uuid,uuid,text,integer),public.reelstudio_ai_finish(uuid,uuid,text,uuid,jsonb) to service_role;
create function public.reelstudio_ai_unlocked(owner_id uuid, video_id uuid, source_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.reelstudio_ai_videos where user_id=owner_id and project_id=video_id and source_version=source_hash and unlocked);
$$;
revoke all on function public.reelstudio_ai_unlocked(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reelstudio_ai_unlocked(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
