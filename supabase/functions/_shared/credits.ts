import { env, service, razorpay } from './runtime.ts';
export function creditPack() {
  const amount = Number(env('AI_CREDIT_PACK_AMOUNT_PAISE'));
  const credits = Number(env('AI_CREDIT_PACK_SIZE'));
  if (!Number.isSafeInteger(amount) || amount < 100 || !Number.isSafeInteger(credits) || credits < 1 || credits > 100000) throw new Error('Credit pricing is not configured.');
  return { amount, credits, currency: 'INR' };
}
export async function syncCreditOrder(id: string) {
  if (!/^order_[A-Za-z0-9]+$/.test(id)) throw new Error('Invalid order.');
  const db = service();
  const { data: stored, error } = await db.from('reelstudio_credit_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!stored) return false;
  const order = await razorpay(`orders/${id}`);
  if (order.id !== id || order.amount !== stored.amount || order.currency !== 'INR' || order.notes?.reelstudio_user_id !== stored.user_id) throw new Error('Credit order mismatch.');
  if (order.status !== 'paid' || order.amount_paid < stored.amount) return false;
  const { error: grantError } = await db.rpc('reelstudio_credit_payment', { order_id: id });
  if (grantError) throw grantError;
  return true;
}
