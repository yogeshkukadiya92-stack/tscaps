import { env, service, razorpay, cors, userClient } from '../_shared/runtime.ts';
import { validSignature } from '../_shared/billing.ts';
import { creditPack, syncCreditOrder } from '../_shared/credits.ts';
Deno.serve(async request => {
  const headers = cors(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'POST required.' }, { status: 405, headers });
  try {
    if (request.headers.get('Origin') && request.headers.get('Origin') !== env('APP_ORIGIN')) throw new Error('Origin not allowed.');
    const { user } = await userClient(request);
    const { action, orderId, paymentId, signature } = await request.json();
    const db = service();
    if (action === 'status') {
      const { data, error } = await db.from('reelstudio_credit_wallets').select('balance').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      let pack = null;
      try { pack = creditPack(); } catch { /* Do not sell credits until pricing is configured. */ }
      return Response.json({ balance: data?.balance ?? 0, pack }, { headers });
    }
    if (action === 'create') {
      const pack = creditPack();
      const order = await razorpay('orders', { amount: pack.amount, currency: 'INR', receipt: crypto.randomUUID(), notes: { reelstudio_user_id: user.id, kind: 'ai_credits' } });
      const { error } = await db.from('reelstudio_credit_orders').insert({ id: order.id, user_id: user.id, amount: pack.amount, credits: pack.credits });
      if (error) throw error;
      return Response.json({ ...pack, keyId: env('RAZORPAY_KEY_ID'), orderId: order.id }, { headers });
    }
    if (action !== 'verify' || typeof orderId !== 'string' || !/^order_[A-Za-z0-9]+$/.test(orderId)
      || typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || typeof signature !== 'string') throw new Error('Invalid payment.');
    const { data, error } = await db.from('reelstudio_credit_orders').select('id').eq('id', orderId).eq('user_id', user.id).maybeSingle();
    if (error || !data || !await validSignature(env('RAZORPAY_KEY_SECRET'), `${orderId}|${paymentId}`, signature)) throw new Error('Payment verification failed.');
    const credited = await syncCreditOrder(orderId);
    return Response.json({ credited }, { headers });
  } catch {
    return Response.json({ error: 'Credits could not be updated. Retry or contact support if payment was taken.' }, { status: 400, headers });
  }
});
