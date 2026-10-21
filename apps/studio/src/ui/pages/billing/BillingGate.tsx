import { UiText, useTranslation } from '@ui/i18n/Locale';
import { AiCreditsSection } from '@ui/pages/billing/AiCreditsSection';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { accessMilliseconds, billingEnabled, loadRazorpay, SUBSCRIPTION_PLANS, type BillingStatus } from '@core/billing/Billing';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function BillingGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { client, session } = useCloudAuth();
  const enabled = billingEnabled() && !!client && !!session;
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [plan, setPlan] = useState<keyof typeof SUBSCRIPTION_PLANS>('monthly');
  const selectedPlan = SUBSCRIPTION_PLANS[plan];
  const deadline = useRef(Infinity);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!client) return;
    const { data, error: cause } = await client.rpc('reelstudio_billing_status');
    if (cause || !data) throw new Error('Could not check your subscription. Please retry.');
    const next = data as BillingStatus;
    const remaining = accessMilliseconds(next);
    if (!Number.isFinite(remaining) && !next.is_admin && !next.complimentary_unlimited) throw new Error('Invalid subscription response. Please retry.');
    if (!mounted.current) return;
    deadline.current = performance.now() + remaining;
    setStatus(next); setError('');
  }, [client]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const check = () => { void refresh().catch((cause: Error) => { if (active) setError(cause.message); }); };
    check();
    const timer = window.setInterval(() => {
      if (performance.now() >= deadline.current) setStatus(previous => previous ? { ...previous, allowed: false } : null);
      check();
    }, 30000);
    const focus = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('focus', check);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', check); };
  }, [enabled, refresh]);
  async function call(body: Record<string, unknown>) {
    const { data, error: cause } = await client!.functions.invoke('reelstudio-billing', { body });
    if (cause || data?.error) {
      // Supabase puts non-2xx JSON in the response context.
      let detail = data?.error;
      if (!detail && cause && 'context' in cause && cause.context instanceof Response) {
        const payload = await cause.context.json().catch(() => null); detail = payload?.error;
      }
      throw new Error(typeof detail === 'string' ? detail : 'Payment service is unavailable. Please retry.');
    }
    return data;
  }
  async function subscribe() {
    setBusy(true); setError(''); setMessage('');
    try {
      await loadRazorpay();
      const created = await call({ action: 'create', plan });
      const checkout = new window.Razorpay!({ key: created.keyId, subscription_id: created.subscriptionId,
        name: 'ReelStudio', description: `${selectedPlan.name} subscription · ${selectedPlan.price}/${selectedPlan.unit}`,
        prefill: { email: session?.user.email ?? '' }, theme: { color: '#657bea' },
        modal: { ondismiss: () => { if (mounted.current) setBusy(false); } },
        handler: response => { void (async () => {
          try {
            if (response.razorpay_subscription_id !== created.subscriptionId) throw new Error('Subscription mismatch.');
            await call({ action: 'verify', subscriptionId: created.subscriptionId, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
            await refresh();
            if (mounted.current) { setMessage('Payment submitted. Access opens as soon as Razorpay confirms the paid subscription.'); setManage(false); }
          } catch (cause) { if (mounted.current) setError((cause as Error).message); }
          finally { if (mounted.current) setBusy(false); }
        })(); },
      });
      checkout.on('payment.failed', () => { if (mounted.current) { setBusy(false); setMessage('Payment did not complete. You can retry with the same checkout.'); } });
      checkout.open();
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  async function updateSubscription(cancel: boolean) {
    if (!status?.subscription) return;
    setBusy(true); setError('');
    try {
      await call({ action: cancel ? 'cancel' : 'refresh', subscriptionId: status.subscription.id });
      await refresh(); setConfirmCancel(false);
      setMessage(cancel ? 'Renewal cancelled. Your access continues until the paid period ends.' : 'Subscription status refreshed.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (!enabled) return <>{children}</>;
  const unlocked = status?.allowed === true && !error;
  const paid = status?.paid_until && Date.parse(status.paid_until) > Date.parse(status.server_now);
  const trial = status && Date.parse(status.trial_ends_at) > Date.parse(status.server_now);
  const subscription = status?.subscription;
  const panel = <section aria-label={t("ReelStudio subscription")} className="w-full max-w-lg my-auto shrink-0 p-5 sm:p-7 rounded-lg border border-edge-medium bg-surface-1 text-fg-primary space-y-5">
    <div><p className="text-sm text-accent mb-2"><UiText text="REELSTUDIO PRO" /></p><h1 className="text-2xl font-semibold">{!status ? t('Checking your access') : status.access_blocked ? t('Your cloud access is paused') : unlocked ? t('Your subscription') : t('Your free trial has ended')}</h1></div>
    <p className="text-fg-secondary">{!status ? t('Please wait while we check your account.') : status.access_blocked ? t('Contact the administrator to restore cloud access. Your saved projects are kept in your account.') : unlocked ? t('Create, caption and export your reels with ReelStudio.') : t('Choose a weekly or monthly subscription to continue editing and exporting. Your saved projects are kept in your account.')}</p>
    {paid ? <div className="rounded-md border border-edge-subtle p-4"><strong className="text-3xl">{SUBSCRIPTION_PLANS[subscription?.billing_cycle ?? 'monthly'].price}</strong><span className="text-fg-muted"> / {SUBSCRIPTION_PLANS[subscription?.billing_cycle ?? 'monthly'].unit}</span></div>
      : <fieldset className="grid grid-cols-2 gap-3" disabled={busy}><legend className="text-sm text-fg-secondary mb-3"><UiText text="Choose your plan" /></legend>
        {(Object.keys(SUBSCRIPTION_PLANS) as Array<keyof typeof SUBSCRIPTION_PLANS>).map(cycle => <label key={cycle} className={`cursor-pointer rounded-md border p-3 ${plan === cycle ? 'border-accent bg-accent/5' : 'border-edge-subtle'}`}>
          <span className="flex items-center gap-2 text-sm mb-2"><input type="radio" name="billing-plan" value={cycle} checked={plan === cycle} onChange={() => setPlan(cycle)} /><UiText text={SUBSCRIPTION_PLANS[cycle].name} /></span>
          <strong className="text-2xl">{SUBSCRIPTION_PLANS[cycle].price}</strong><span className="text-xs text-fg-muted block"><UiText text="per " />{SUBSCRIPTION_PLANS[cycle].unit}</span>
        </label>)}
      </fieldset>}
    <p className="text-sm text-fg-secondary"><UiText text="Renews " />{paid ? SUBSCRIPTION_PLANS[subscription?.billing_cycle ?? 'monthly'].renews : selectedPlan.renews}<UiText text=" through Razorpay after you subscribe. Cancel renewal anytime." /></p>
    {trial && <p className="text-sm"><UiText text="Free trial ends " />{date(status!.trial_ends_at)}<UiText text=". No payment is collected during your trial." /></p>}
    {paid && <p className="text-sm"><UiText text="Access until " />{date(status!.paid_until!)}{subscription?.cancel_at_cycle_end ? t(' · Renewal cancelled') : ''}</p>}
    {subscription && <p className="text-sm text-fg-muted"><UiText text="Subscription: " />{subscription.status}</p>}
    {message && <p role="status" className="text-sm text-fg-secondary"><UiText text={message} /></p>}
    {error && <p role="alert" className="text-sm text-danger"><UiText text={error} /></p>}
    <div className="flex gap-3 flex-wrap">
      {status && !status.allowed && !status.access_blocked && <button className={BTN_PRIMARY} disabled={busy} onClick={() => void subscribe()}>{busy ? t('Please wait…') : t("Subscribe · {0}/{1}", { 0: selectedPlan.price, 1: selectedPlan.unit })}</button>}
      <button className={BTN_SECONDARY} disabled={busy} onClick={() => void (subscription ? updateSubscription(false) : refresh().catch((cause: Error) => setError(cause.message)))}><UiText text="Refresh status" /></button>
      {unlocked && <button className={BTN_SECONDARY} onClick={() => setManage(false)}><UiText text="Back to editing" /></button>}
    </div>
    {subscription && !subscription.cancel_at_cycle_end && ['active','authenticated','pending','halted','created'].includes(subscription.status) && <div className="border-t border-edge-subtle pt-4">
      {confirmCancel ? <><p className="text-sm mb-3"><UiText text="Cancel the next renewal? Any already-paid access remains available." /></p><button className={BTN_SECONDARY} disabled={busy} onClick={() => void updateSubscription(true)}><UiText text="Confirm cancellation" /></button><button className={BTN_SECONDARY} disabled={busy} onClick={() => setConfirmCancel(false)}><UiText text="Keep subscription" /></button></>
        : <button className={BTN_SECONDARY} disabled={busy} onClick={() => setConfirmCancel(true)}><UiText text="Cancel renewal" /></button>}
    </div>}
    <AiCreditsSection />
  </section>;
  return <>
    {unlocked && <div className="shrink-0 px-5 py-2 border-b border-edge-subtle flex items-center justify-between gap-3 text-xs text-fg-secondary bg-surface-1">
      <span>{status.is_admin ? t('Administrator access') : status.complimentary_unlimited ? t('Complimentary access · no expiry') : status.complimentary_until ? t("Complimentary access · until {0}", { 0: date(status.complimentary_until) }) : paid ? t("Subscribed · access until {0}", { 0: date(status.paid_until!) }) : t("5-day free trial · ends {0}", { 0: date(status.trial_ends_at) })}</span>
      <button className={BTN_SECONDARY} onClick={() => setManage(true)}><UiText text="Subscription" /></button>
    </div>}
    {unlocked ? children : <main className="flex-1 overflow-y-auto flex flex-col items-center p-4 bg-surface-0">{panel}</main>}
    {unlocked && manage && <div role="dialog" aria-modal="true" aria-label={t("Manage subscription")} className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center p-4 overflow-y-auto">{panel}</div>}
  </>;
}
