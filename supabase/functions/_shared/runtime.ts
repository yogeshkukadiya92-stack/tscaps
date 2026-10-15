import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { providerSnapshot, type ProviderSubscription } from './billing.ts';

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server setting: ${name}`);
  return value;
}
export const service = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
export class ProviderRequestError extends Error {
  constructor(readonly status: number) { super(`Razorpay request failed (${status}). Please retry or contact support.`); }
}
export async function razorpay(path: string, body?: unknown) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Basic ${btoa(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new ProviderRequestError(response.status);
  return response.json();
}
export async function syncSubscription(id: string, cancelled = false) {
  const fetchedAt = new Date().toISOString();
  const subscription: ProviderSubscription = await razorpay(`subscriptions/${id}`);
  if (subscription.id !== id) throw new Error('Subscription mismatch.');
  const db = service();
  const { data: stored, error: lookupError } = await db.from('reelstudio_subscriptions').select('plan_id,cancel_at_cycle_end').eq('id', id).single();
  if (lookupError || subscription.plan_id !== stored.plan_id) throw new Error('Subscription plan mismatch.');
  const snapshot = providerSnapshot(subscription);
  const { error } = await db.rpc('reelstudio_sync_subscription', {
    subscription_id: id, provider_status: subscription.status, provider_end: snapshot.end,
    provider_paid_until: snapshot.paidUntil, cancelled: cancelled || stored.cancel_at_cycle_end, fetched_at: fetchedAt,
  });
  if (error) throw error;
  return subscription;
}
export function cors(origin: string | null) {
  const allowed = env('APP_ORIGIN');
  return { 'Access-Control-Allow-Origin': origin === allowed ? allowed : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
}
export async function userClient(request: Request) {
  const auth = request.headers.get('Authorization') ?? '';
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in again.');
  return { client, user: data.user };
}
