export type AdminSubscriptionOperation = 'admin_refresh' | 'admin_cancel';
export interface AdminSubscriptionPorts {
  isAdmin(): Promise<boolean>;
  findSubscription(id: string, target: string): Promise<{ status: string; cancel_at_cycle_end: boolean } | null>;
  audit(actor: string, target: string, id: string, operation: string, reason: string): Promise<void>;
  cancelAtPeriodEnd(id: string): Promise<void>;
  sync(id: string, cancelled: boolean): Promise<unknown>;
}
/** Provider mutations always follow an authenticated admin and exact account/subscription lookup. */
export async function manageAdminSubscription(input: { action: unknown; targetId: unknown; subscriptionId: unknown; reason: unknown }, actor: string, ports: AdminSubscriptionPorts): Promise<void> {
  if (!await ports.isAdmin()) throw new Error('Administrator access required.');
  const { action, targetId, subscriptionId, reason } = input;
  if (!['admin_refresh', 'admin_cancel'].includes(String(action))
    || typeof targetId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(targetId)
    || typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
    || typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new Error('Select an account and subscription and enter a reason.');
  const owned = await ports.findSubscription(subscriptionId, targetId);
  if (!owned) throw new Error('Subscription does not belong to the selected account.');
  if (action === 'admin_cancel' && !owned.cancel_at_cycle_end) {
    if (!['active', 'authenticated', 'pending', 'halted', 'created'].includes(owned.status)) throw new Error('This subscription cannot be cancelled. Refresh its status first.');
    await ports.audit(actor, targetId, subscriptionId, 'subscription_cancel_requested', reason.trim());
    await ports.cancelAtPeriodEnd(subscriptionId);
  }
  await ports.sync(subscriptionId, action === 'admin_cancel');
  await ports.audit(actor, targetId, subscriptionId, action === 'admin_cancel' ? 'subscription_cancelled' : 'subscription_refresh', reason.trim());
}
