import { describe, expect, it, vi } from 'vitest';
import { manageAdminSubscription, type AdminSubscriptionPorts } from '../../../../../supabase/functions/_shared/adminBilling';
const input = { action: 'admin_cancel', targetId: '10000000-0000-4000-8000-000000000002', subscriptionId: 'sub_123', reason: 'Customer request' };
function ports(): AdminSubscriptionPorts {
  return { isAdmin: vi.fn().mockResolvedValue(true), findSubscription: vi.fn().mockResolvedValue({ status: 'active', cancel_at_cycle_end: false }), audit: vi.fn().mockResolvedValue(undefined), cancelAtPeriodEnd: vi.fn().mockResolvedValue(undefined), sync: vi.fn().mockResolvedValue(undefined) };
}
describe('administrator subscription controls', () => {
  it('rejects ordinary users before any lookup or provider request', async () => {
    const p = ports(); vi.mocked(p.isAdmin).mockResolvedValue(false);
    await expect(manageAdminSubscription(input, 'actor', p)).rejects.toThrow('Administrator');
    expect(p.findSubscription).not.toHaveBeenCalled(); expect(p.cancelAtPeriodEnd).not.toHaveBeenCalled();
  });
  it('rejects subscriptions not belonging to the selected account', async () => {
    const p = ports(); vi.mocked(p.findSubscription).mockResolvedValue(null);
    await expect(manageAdminSubscription(input, 'actor', p)).rejects.toThrow('does not belong');
    expect(p.findSubscription).toHaveBeenCalledWith(input.subscriptionId, input.targetId);
    expect(p.cancelAtPeriodEnd).not.toHaveBeenCalled();
  });
  it('records intent before cancellation and only cancels at the current period end', async () => {
    const p = ports(); await manageAdminSubscription(input, 'actor', p);
    expect(p.audit).toHaveBeenNthCalledWith(1, 'actor', input.targetId, input.subscriptionId, 'subscription_cancel_requested', input.reason);
    expect(vi.mocked(p.audit).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(p.cancelAtPeriodEnd).mock.invocationCallOrder[0]!);
    expect(p.cancelAtPeriodEnd).toHaveBeenCalledWith(input.subscriptionId);
    expect(p.sync).toHaveBeenCalledWith(input.subscriptionId, true);
    expect(p.audit).toHaveBeenLastCalledWith('actor', input.targetId, input.subscriptionId, 'subscription_cancelled', input.reason);
  });
  it('does not make a provider mutation for refresh or an already-cancelled renewal', async () => {
    const p = ports(); await manageAdminSubscription({ ...input, action: 'admin_refresh' }, 'actor', p);
    expect(p.cancelAtPeriodEnd).not.toHaveBeenCalled(); expect(p.sync).toHaveBeenCalledWith(input.subscriptionId, false);
    vi.mocked(p.findSubscription).mockResolvedValue({ status: 'active', cancel_at_cycle_end: true });
    await manageAdminSubscription(input, 'actor', p); expect(p.cancelAtPeriodEnd).not.toHaveBeenCalled();
  });
  it('does not claim cancellation succeeded when the provider fails', async () => {
    const p = ports(); vi.mocked(p.cancelAtPeriodEnd).mockRejectedValue(new Error('Provider timeout'));
    await expect(manageAdminSubscription(input, 'actor', p)).rejects.toThrow('Provider timeout');
    expect(p.sync).not.toHaveBeenCalled(); expect(p.audit).toHaveBeenCalledTimes(1);
  });
});
