import { env, service, razorpay, syncSubscription, cors, userClient, ProviderRequestError } from '../_shared/runtime.ts';
import { BILLING_PLANS, billingCycle, validatePlan, validSignature } from '../_shared/billing.ts';

import { manageAdminSubscription } from '../_shared/adminBilling.ts';

Deno.serve(async request => {
  const headers = cors(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error: 'POST required.' }, { status: 405, headers });
  try {
    if (request.headers.get('Origin') && request.headers.get('Origin') !== env('APP_ORIGIN')) throw new Error('Origin not allowed.');
    const { client, user } = await userClient(request);
    const { action, subscriptionId, paymentId, signature, plan, targetId, reason } = await request.json();
    const db = service();
    const status = async () => {
      const { data, error } = await client.rpc('reelstudio_billing_status');
      if (error || !data) throw new Error('Billing is not configured. Please contact support.');
      return data;
    };
    if (action === 'admin_refresh' || action === 'admin_cancel') {
      await manageAdminSubscription({ action, targetId, subscriptionId, reason }, user.id, {
        async isAdmin() {
          const { data, error } = await client.rpc('reelstudio_is_admin');
          return !error && data === true;
        },
        async findSubscription(id, target) {
          const { data, error } = await db.from('reelstudio_subscriptions').select('status,cancel_at_cycle_end').eq('id', id).eq('user_id', target).maybeSingle();
          if (error) throw error;
          return data;
        },
        async audit(actor, target, id, operation, reason) {
          const { error } = await db.rpc('reelstudio_log_subscription_action', { actor, target, subscription_id: id, operation, reason });
          if (error) throw new Error('Could not record the subscription operation. Check admin history before retrying.');
        },
        async cancelAtPeriodEnd(id) { await razorpay(`subscriptions/${id}/cancel`, { cancel_at_cycle_end: 1 }); },
        sync: syncSubscription,
      });
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'status') return Response.json(await status(), { headers });
    if (action === 'create') {
      const cycle = billingCycle(plan);
      const access = await status();
      if (access.allowed) throw new Error('Your current access is still valid. Subscribe after it ends.');
      const { data: latest, error: lookupError } = await db.from('reelstudio_subscriptions').select('*')
        .eq('user_id', user.id).order('checked_at', { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      const planId = env(BILLING_PLANS[cycle].setting);
      validatePlan(await razorpay(`plans/${planId}`), cycle);
      if (latest && !['cancelled', 'completed', 'expired'].includes(latest.status)) {
        if (latest.plan_id !== planId) throw new Error('Your existing subscription uses a different plan. Contact support before subscribing again.');
        await syncSubscription(latest.id);
        return Response.json({ keyId: env('RAZORPAY_KEY_ID'), subscriptionId: latest.id }, { headers });
      }
      const token = crypto.randomUUID();
      const { data: reserved, error: reserveError } = await db.rpc('reelstudio_reserve_checkout', { owner_id: user.id, token });
      if (reserveError || !reserved) throw new Error('A checkout is already being prepared. If this persists, contact support before trying again.');
      // Do not blindly retry this POST: an ambiguous timeout may already have created a mandate.
      let created;
      try {
        created = await razorpay('subscriptions', { plan_id: planId, total_count: 120, quantity: 1,
          customer_notify: true, notes: { reelstudio_user_id: user.id, reelstudio_checkout_token: token } });
      } catch (cause) {
        if (cause instanceof ProviderRequestError && cause.status >= 400 && cause.status < 500) {
          await db.from('reelstudio_billing_accounts').update({ checkout_token: null }).eq('user_id', user.id).eq('checkout_token', token);
        }
        throw cause;
      }
      const { error: insertError } = await db.from('reelstudio_subscriptions').insert({
        id: created.id, user_id: user.id, plan_id: planId, billing_cycle: cycle, status: created.status,
      });
      if (insertError) throw insertError;
      const { error: releaseError } = await db.from('reelstudio_billing_accounts').update({ checkout_token: null }).eq('user_id', user.id).eq('checkout_token', token);
      if (releaseError) throw releaseError;
      return Response.json({ keyId: env('RAZORPAY_KEY_ID'), subscriptionId: created.id }, { headers });
    }
    if (!['verify', 'refresh', 'cancel'].includes(action) || typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error('Invalid billing request.');
    const { data: owned, error: ownedError } = await db.from('reelstudio_subscriptions').select('id').eq('id', subscriptionId).eq('user_id', user.id).maybeSingle();
    if (ownedError || !owned) throw new Error('Subscription not found for your account.');
    if (action === 'verify') {
      if (typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || typeof signature !== 'string'
        || !await validSignature(env('RAZORPAY_KEY_SECRET'), `${paymentId}|${subscriptionId}`, signature)) throw new Error('Payment verification failed.');
    }
    if (action === 'cancel') await razorpay(`subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: 1 });
    await syncSubscription(subscriptionId, action === 'cancel');
    return Response.json(await status(), { headers });
  } catch (error) {
    console.error('Billing operation failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: error instanceof Error ? error.message : 'Billing could not complete. Please retry.' }, { status: 400, headers });
  }
});
