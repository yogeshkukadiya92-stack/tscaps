export interface ProviderSubscription {
  id: string; plan_id: string; status: string; paid_count: number;
  current_end: number | null; has_scheduled_changes?: boolean;
  remaining_count?: number; ended_at?: number | null;
}
export const MONTHLY_AMOUNT = 79900;
export const BILLING_PLANS = {
  weekly: { amount: 39900, setting: 'RAZORPAY_WEEKLY_PLAN_ID' },
  monthly: { amount: MONTHLY_AMOUNT, setting: 'RAZORPAY_MONTHLY_PLAN_ID' },
} as const;
export function billingCycle(value: unknown = 'monthly'): keyof typeof BILLING_PLANS {
  if (value !== 'weekly' && value !== 'monthly') throw new Error('Choose a weekly or monthly subscription.');
  return value;
}
export function validatePlan(plan: { period: string; interval: number; item: { amount: number; currency: string } }, cycle: keyof typeof BILLING_PLANS = 'monthly') {
  const expected = BILLING_PLANS[cycle];
  if (plan.period !== cycle || plan.interval !== 1 || plan.item.amount !== expected.amount || plan.item.currency !== 'INR') {
    throw new Error(`Configure an INR ${expected.amount / 100} ${cycle} Razorpay plan.`);
  }
}
export function providerSnapshot(subscription: ProviderSubscription) {
  const end = subscription.current_end ? new Date(subscription.current_end * 1000).toISOString() : null;
  // Failed/pending periods and mandate authentication never extend paid access.
  return { end, paidUntil: subscription.status === 'active' && subscription.paid_count > 0 ? end : null };
}
export async function validSignature(secret: string, message: string, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', key, bytes, enc.encode(message));
}
