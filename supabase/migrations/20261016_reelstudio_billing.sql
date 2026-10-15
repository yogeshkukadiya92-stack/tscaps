begin;
create table public.reelstudio_billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '5 days'),
  checkout_token uuid,
  check (trial_ends_at = trial_started_at + interval '5 days')
);
create table public.reelstudio_subscriptions (
  id text primary key check (id ~ '^sub_[A-Za-z0-9]+$'),
  user_id uuid not null references public.reelstudio_billing_accounts(user_id) on delete cascade,
  plan_id text not null,
  status text not null,
  paid_until timestamptz,
  current_end timestamptz,
  cancel_at_cycle_end boolean not null default false,
  checked_at timestamptz not null default now()
);
create index on public.reelstudio_subscriptions(user_id, checked_at desc);
alter table public.reelstudio_billing_accounts enable row level security;
alter table public.reelstudio_subscriptions enable row level security;
revoke all on public.reelstudio_billing_accounts, public.reelstudio_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.reelstudio_billing_accounts, public.reelstudio_subscriptions to service_role;
-- Existing customers receive their five days from this rollout. New accounts start at signup.
insert into public.reelstudio_billing_accounts(user_id) select id from auth.users;
create function public.reelstudio_start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reelstudio_billing_accounts(user_id) values(new.id);
  return new;
end;
$$;
create trigger reelstudio_start_trial after insert on auth.users
  for each row execute function public.reelstudio_start_trial();

create function public.reelstudio_has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.reelstudio_billing_accounts a
    where a.user_id = auth.uid() and (a.trial_ends_at > now() or exists(
      select 1 from public.reelstudio_subscriptions s where s.user_id = a.user_id and s.paid_until > now()
    ))) or exists(select 1 from public.reelstudio_admins where user_id = auth.uid());
$$;
create function public.reelstudio_billing_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('allowed', public.reelstudio_has_access(),
    'server_now', now(), 'trial_ends_at', a.trial_ends_at,
    'is_admin', exists(select 1 from public.reelstudio_admins where user_id = auth.uid()),
    'paid_until', (select max(paid_until) from public.reelstudio_subscriptions where user_id = auth.uid()),
    'subscription', (select jsonb_build_object('id',s.id,'status',s.status,'current_end',s.current_end,
      'cancel_at_cycle_end',s.cancel_at_cycle_end) from public.reelstudio_subscriptions s
      where s.user_id = auth.uid() order by s.checked_at desc limit 1))
  from public.reelstudio_billing_accounts a where a.user_id = auth.uid();
$$;

-- A durable creation reservation prevents double-clicks/concurrent tabs creating duplicate mandates.
-- Ambiguous provider timeouts deliberately retain the token until reconciled by the operator.
create function public.reelstudio_reserve_checkout(owner_id uuid, token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.reelstudio_billing_accounts set checkout_token = token
    where user_id = owner_id and checkout_token is null and not exists(
      select 1 from public.reelstudio_subscriptions s where s.user_id = owner_id
        and s.status not in ('cancelled','completed','expired')
    );
  return found;
end;
$$;
create function public.reelstudio_sync_subscription(subscription_id text, provider_status text,
  provider_end timestamptz, provider_paid_until timestamptz, cancelled boolean, fetched_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.reelstudio_subscriptions set status = provider_status, current_end = provider_end,
    paid_until = greatest(paid_until, provider_paid_until), cancel_at_cycle_end = cancelled, checked_at = fetched_at
    where id = subscription_id and checked_at <= fetched_at;
$$;
revoke all on function public.reelstudio_start_trial(), public.reelstudio_has_access(), public.reelstudio_billing_status(),
  public.reelstudio_reserve_checkout(uuid,uuid), public.reelstudio_sync_subscription(text,text,timestamptz,timestamptz,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.reelstudio_has_access(), public.reelstudio_billing_status() to authenticated;
grant execute on function public.reelstudio_reserve_checkout(uuid,uuid), public.reelstudio_sync_subscription(text,text,timestamptz,timestamptz,boolean,timestamptz) to service_role;

-- Keep ownership RLS, adding a mandatory entitlement check to cloud writes.
create policy reelstudio_paid_project_insert on public.reelstudio_projects as restrictive for insert to authenticated
  with check ((select public.reelstudio_has_access()));
create policy reelstudio_paid_project_update on public.reelstudio_projects as restrictive for update to authenticated
  using ((select public.reelstudio_has_access())) with check ((select public.reelstudio_has_access()));
create policy reelstudio_paid_media_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'reelstudio-videos' or (select public.reelstudio_has_access()));
create policy reelstudio_paid_media_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'reelstudio-videos' or (select public.reelstudio_has_access()))
  with check (bucket_id <> 'reelstudio-videos' or (select public.reelstudio_has_access()));
notify pgrst, 'reload schema';
commit;
