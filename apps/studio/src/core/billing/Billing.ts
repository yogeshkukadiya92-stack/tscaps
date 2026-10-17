export interface BillingStatus {
  access_blocked?: boolean; complimentary_unlimited?: boolean; complimentary_until?: string | null; billing_configured?: boolean;
  allowed: boolean; server_now: string; trial_ends_at: string; paid_until: string | null; is_admin: boolean;
  subscription: { id: string; status: string; current_end: string | null; cancel_at_cycle_end: boolean; billing_cycle?: 'weekly' | 'monthly' } | null;
}
export const SUBSCRIPTION_PLANS = {
  weekly: { name: 'Weekly', price: '₹399', unit: 'week', renews: 'weekly' },
  monthly: { name: 'Monthly', price: '₹799', unit: 'month', renews: 'monthly' },
} as const;
export const billingEnabled = () => window.__REELSTUDIO_CONFIG__?.billingEnabled
  ?? import.meta.env.VITE_BILLING_ENABLED === 'true';
export function accessMilliseconds(status: BillingStatus): number {
  if (status.access_blocked) return 0;
  if (status.is_admin || status.complimentary_unlimited) return Infinity;
  return Math.max(0, Math.max(Date.parse(status.trial_ends_at), status.paid_until ? Date.parse(status.paid_until) : 0, status.complimentary_until ? Date.parse(status.complimentary_until) : 0) - Date.parse(status.server_now));
}
interface CheckoutResult { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_order_id?: string; razorpay_signature: string }
interface CheckoutOptions {
  key: string; subscription_id?: string; order_id?: string; amount?: number; currency?: string; name: string; description: string;
  prefill: { email: string }; theme: { color: string };
  handler: (response: CheckoutResult) => void; modal: { ondismiss: () => void };
}
declare global {
  interface Window { Razorpay?: new (options: CheckoutOptions) => { open(): void; on(event: string, handler: () => void): void } }
}
let loading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Payment checkout timed out. Please retry.')); }, 15000);
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    script.onload = () => { clearTimeout(timeout); if (window.Razorpay) resolve(); else reject(new Error('Checkout is unavailable.')); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Could not load Razorpay. Please retry.')); };
    document.head.appendChild(script);
  }).catch(error => { loading = null; throw error; });
  return loading;
}
