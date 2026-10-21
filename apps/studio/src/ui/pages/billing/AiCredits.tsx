import { UiText } from '@ui/i18n/Locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { loadRazorpay } from '@core/billing/Billing';
import { AsyncButton } from '@ui/_shared/components/AsyncButton/AsyncButton';
import { BTN_SECONDARY } from '@ui/_shared/styles/buttons';

interface Status { balance: number; pack: { amount: number; credits: number } | null }
export function AiCredits() {
  const { client, session } = useCloudAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function call(body: Record<string, unknown>) {
    if (!client || !session) throw new Error('Sign in to buy AI credits.');
    const { data, error } = await client.functions.invoke('reelstudio-credits', { body });
    if (error || data?.error) throw new Error('Could not update credits. If you paid, check your balance again before paying again.');
    return data;
  }
  async function refresh() {
    try { setStatus(await call({ action: 'status' }) as Status); setMessage(''); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not load credits.'); }
  }
  async function buy() {
    setBusy(true); setMessage('');
    try {
      await loadRazorpay();
      const order = await call({ action: 'create' });
      new window.Razorpay!({ key: order.keyId, order_id: order.orderId, amount: order.amount, currency: 'INR', name: 'ReelStudio',
        description: `${order.credits} AI editing credits`, prefill: { email: session?.user.email ?? '' }, theme: { color: '#334ed8' },
        modal: { ondismiss: () => setBusy(false) },
        handler: response => { void (async () => {
          try {
            const result = await call({ action: 'verify', orderId: order.orderId, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
            await refresh();
            setMessage(result.credited ? 'Credits added. You can now create your AI edit.' : 'Payment is still being confirmed. Check credits shortly; do not pay again.');
          } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Check credits again before paying again.'); }
          finally { setBusy(false); }
        })(); },
      }).open();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Checkout could not open.'); setBusy(false); }
  }
  return <div className="flex flex-col gap-2 text-xs">
    <p className="m-0"><UiText text="Standard: 1 credit / 5 seconds · High AI quality: 2 credits / 5 seconds. Partial blocks round up. Prompt revisions for this saved video at the same quality use no additional credits." /></p>
    {session ? <AsyncButton className={BTN_SECONDARY} disabled={busy} onClick={refresh}><UiText text="Check credits" /></AsyncButton> : <Link className={BTN_SECONDARY} to="/signin"><UiText text="Sign in to view or buy credits" /></Link>}
    {status && <><p className="m-0" role="status"><UiText text="Available: " />{status.balance}<UiText text=" credits" /></p>
      {status.pack ? <AsyncButton className={BTN_SECONDARY} disabled={busy} onClick={buy}><UiText text="Buy " />{status.pack.credits}<UiText text=" credits · ₹" />{(status.pack.amount / 100).toFixed(2)}</AsyncButton> : <p className="m-0"><UiText text="Credit pricing will be available soon." /></p>}</>}
    {message && <p role="status" className="m-0"><UiText text={message} /></p>}
  </div>;
}
