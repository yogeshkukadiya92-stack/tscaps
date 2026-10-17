import { syncCreditOrder } from '../_shared/credits.ts';
import { env, service, syncSubscription } from '../_shared/runtime.ts';
import { validSignature } from '../_shared/billing.ts';

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('POST required', { status: 405 });
  try {
    const raw = await request.text();
    if (!await validSignature(env('RAZORPAY_WEBHOOK_SECRET'), raw, request.headers.get('X-Razorpay-Signature') ?? '')) return new Response('Invalid signature', { status: 401 });
    const event = JSON.parse(raw);
    if (event.event === 'order.paid' || event.event === 'payment.captured') {
      const orderId = event.payload?.order?.entity?.id ?? event.payload?.payment?.entity?.order_id;
      if (typeof orderId === 'string' && /^order_[A-Za-z0-9]+$/.test(orderId)) await syncCreditOrder(orderId);
    }
    const id = event.payload?.subscription?.entity?.id;
    if (typeof id !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(id)) return new Response('Ignored', { status: 200 });
    const { data, error } = await service().from('reelstudio_subscriptions').select('id').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return new Response('Unmanaged subscription', { status: 200 });
    // Re-fetch authoritative state: retries and out-of-order webhooks cannot apply stale payloads.
    await syncSubscription(id);
    return new Response('OK', { status: 200 });
  } catch {
    // Non-2xx lets Razorpay retry delivery; never acknowledge a failed entitlement write.
    return new Response('Please retry', { status: 503 });
  }
});
