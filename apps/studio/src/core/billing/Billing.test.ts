import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { accessMilliseconds, type BillingStatus } from '@core/billing/Billing';
// Cross-runtime security contract: exercise the exact helpers deployed to Edge Functions.
// eslint-disable-next-line no-restricted-syntax
import { billingCycle, providerSnapshot, validSignature, validatePlan } from '../../../../../supabase/functions/_shared/billing';

const status: BillingStatus = { allowed: true, server_now: '2026-10-15T10:00:00Z', trial_ends_at: '2026-10-20T10:00:00Z', paid_until: null, is_admin: false, subscription: null };
describe('five-day access', () => {
  it('uses server time and expires exactly at five days', () => {
    expect(accessMilliseconds(status)).toBe(5 * 86400000);
    expect(accessMilliseconds({ ...status, server_now: status.trial_ends_at })).toBe(0);
    expect(accessMilliseconds({ ...status, server_now: '2027-01-01T00:00:00Z' })).toBe(0);
  });
  it('supports timed and permanent complimentary access without changing paid dates', () => {
    expect(accessMilliseconds({ ...status, server_now: status.trial_ends_at, complimentary_until: '2026-10-22T10:00:00Z' })).toBe(2 * 86400000);
    expect(accessMilliseconds({ ...status, complimentary_unlimited: true })).toBe(Infinity);
    expect(accessMilliseconds({ ...status, access_blocked: true, complimentary_unlimited: true })).toBe(0);
    expect(accessMilliseconds({ ...status, server_now: '2026-10-23T10:00:00Z', complimentary_until: '2026-10-22T10:00:00Z' })).toBe(0);
  });
  it('keeps a paid period after trial expiry and exempts administrators', () => {
    expect(accessMilliseconds({ ...status, server_now: status.trial_ends_at, paid_until: '2026-10-21T10:00:00Z' })).toBe(86400000);
    expect(accessMilliseconds({ ...status, is_admin: true })).toBe(Infinity);
  });
});
describe('Razorpay trust boundaries', () => {
  it('validates the INR 399 weekly plan and rejects mismatched periods and custom prices', () => {
    expect(billingCycle('weekly')).toBe('weekly');
    expect(billingCycle()).toBe('monthly');
    expect(() => billingCycle('yearly')).toThrow();
    expect(() => billingCycle({ amount: 1 })).toThrow();
    const weekly = { period: 'weekly', interval: 1, item: { amount: 39900, currency: 'INR' } };
    expect(() => validatePlan(weekly, 'weekly')).not.toThrow();
    expect(() => validatePlan(weekly, 'monthly')).toThrow();
    expect(() => validatePlan({ ...weekly, interval: 2 }, 'weekly')).toThrow();
    expect(() => validatePlan({ ...weekly, item: { amount: 399, currency: 'INR' } }, 'weekly')).toThrow();
  });
  it('requires the agreed INR 799 monthly plan', () => {
    expect(() => validatePlan({ period: 'monthly', interval: 1, item: { amount: 79900, currency: 'INR' } })).not.toThrow();
    for (const change of [{ period: 'yearly' }, { interval: 2 }, { item: { amount: 799, currency: 'INR' } }, { item: { amount: 79900, currency: 'USD' } }]) {
      expect(() => validatePlan({ period: 'monthly', interval: 1, item: { amount: 79900, currency: 'INR' }, ...change })).toThrow();
    }
  });
  it('checks the exact raw webhook body and checkout message', async () => {
    for (const body of ['{"event":"subscription.charged"}', 'pay_123|sub_456']) {
      const signature = createHmac('sha256', 'test-secret').update(body).digest('hex');
      expect(await validSignature('test-secret', body, signature)).toBe(true);
      expect(await validSignature('test-secret', `${body} `, signature)).toBe(false);
      expect(await validSignature('wrong', body, signature)).toBe(false);
    }
    expect(await validSignature('test-secret', 'body', 'not-a-signature')).toBe(false);
  });
  it('never unlocks for mandate authentication or failed renewals', () => {
    const subscription = { id: 'sub_123', plan_id: 'plan_123', status: 'active', current_end: 1800000000, paid_count: 1 };
    expect(providerSnapshot(subscription).paidUntil).toBe(new Date(1800000000000).toISOString());
    for (const state of ['authenticated', 'created', 'pending', 'halted', 'cancelled', 'expired']) {
      expect(providerSnapshot({ ...subscription, status: state }).paidUntil).toBeNull();
    }
    expect(providerSnapshot({ ...subscription, paid_count: 0 }).paidUntil).toBeNull();
  });
});
