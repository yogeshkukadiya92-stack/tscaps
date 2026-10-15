begin;
alter table public.reelstudio_subscriptions add column billing_cycle text not null default 'monthly'
  check (billing_cycle in ('weekly','monthly'));
-- Existing rows remain monthly. This migration never restarts or extends a trial.
create or replace function public.reelstudio_billing_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('allowed', public.reelstudio_has_access(),
    'server_now', now(), 'trial_ends_at', a.trial_ends_at,
    'is_admin', exists(select 1 from public.reelstudio_admins where user_id = auth.uid()),
    'paid_until', (select max(paid_until) from public.reelstudio_subscriptions where user_id = auth.uid()),
    'subscription', (select jsonb_build_object('id',s.id,'status',s.status,'current_end',s.current_end,
      'billing_cycle',s.billing_cycle,'cancel_at_cycle_end',s.cancel_at_cycle_end)
      from public.reelstudio_subscriptions s where s.user_id = auth.uid() order by s.checked_at desc limit 1))
  from public.reelstudio_billing_accounts a where a.user_id = auth.uid();
$$;
notify pgrst, 'reload schema';
commit;
