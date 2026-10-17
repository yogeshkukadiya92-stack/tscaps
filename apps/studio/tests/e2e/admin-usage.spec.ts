import { test, expect } from '@playwright/test';

const owner = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
const account = { access: { mode: 'subscription', expires_at: null }, subscriptions: [{ id: 'sub_test123', status: 'active', billing_cycle: 'monthly', paid_until: '2026-11-01T00:00:00Z', current_end: '2026-11-01T00:00:00Z', cancel_at_cycle_end: false, checked_at: '2026-10-17T00:00:00Z' }], id: 'e37a0000-0000-4000-8000-000000000001', email: 'member@example.test', display_name: 'Member', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: null, is_admin: false, projects: 3, deleted_projects: 1, captioned_projects: 2, video_seconds: 180, stored_videos: 2, storage_bytes: 104857600, exports: 4, export_failures: 1, processed_videos: 3, transcriptions: 2, last_active_at: '2026-10-17T00:00:00Z', cloud_enabled: true, project_limit: null, storage_limit_bytes: null, credit_balance: 9, billing: null };
const report = { users: [account], total_count: 1, summary: { users: 1, projects: 3, storage_bytes: 104857600, active_users: 1, exports: 4 }, credits_available: true, billing_available: false, server_now: '2026-10-17T00:00:00Z', audit: [] };

test('administrator can inspect usage, filter, and review an audited limit change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests: Record<string, unknown>[] = [];
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",billingEnabled:false};' }));
  await page.route('https://auth.example.test/**', route => {
    const url = route.request().url();
    if (url.includes('/token')) return route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    if (url.includes('rpc/reelstudio_is_admin')) return route.fulfill({ json: true });
    if (url.includes('rpc/reelstudio_admin_usage')) {
      const body = route.request().postDataJSON(); requests.push(body);
      return route.fulfill({ json: { ...report, ...(body.search === 'missing' ? { users: [], total_count: 0 } : {}) } });
    }
    if (url.includes('rpc/reelstudio_admin_set_access')) { requests.push(route.request().postDataJSON()); return route.fulfill({ json: null }); }
    if (url.includes('/functions/v1/reelstudio-billing')) { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    if (url.includes('rpc/reelstudio_admin_save_limits')) { requests.push(route.request().postDataJSON()); return route.fulfill({ json: null }); }
    if (url.includes('/reelstudio_projects')) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/signin');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await page.getByRole('button', { name: 'Admin panel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('100.0 MB');
  await page.screenshot({ path: '/tmp/reelstudio-admin-usage-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Usage & limits' }).click();
  await expect(page.getByRole('region', { name: 'Account usage and limits' })).toContainText('Transcriptions');
  await expect(page.getByRole('region', { name: 'Account usage and limits' }).getByRole('heading', { level: 2 })).toBeFocused();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByLabel('Reason for change', { exact: true })).toBeFocused();
  await expect(page.locator('#admin-validation')).toBeVisible();
  await page.getByLabel('Project limit', { exact: true }).fill('5');
  await page.getByLabel('Storage limit (MB)', { exact: true }).fill('200');
  await page.getByLabel('Adjust AI credits (+ / −)', { exact: true }).fill('10');
  await page.getByLabel('Reason for change').fill('Support allowance');
  await page.getByRole('button', { name: 'Review changes' }).click();
  expect(requests.some(request => 'target_id' in request)).toBe(false);
  await expect(page.getByRole('group', { name: 'Confirm account changes' })).toContainText('200 MB');
  await page.getByRole('button', { name: 'Confirm changes' }).click();
  await expect(page.getByRole('status')).toContainText('Limits and credits updated');
  expect(requests.find(request => 'target_id' in request)).toMatchObject({ target_id: account.id, project_limit: 5, storage_limit_bytes: 209715200, credit_delta: 10, reason: 'Support allowance' });
  await page.getByRole('button', { name: 'Usage & limits' }).click();
  await page.getByLabel('Access policy').selectOption('complimentary');
  await page.getByLabel('No expiry (permanent complimentary access)').check();
  await page.getByLabel('Reason for access change').fill('Complimentary support account');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.getByRole('form', { name: 'Manage account access' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/reelstudio-subscription-controls-preview.png' });
  await page.getByRole('button', { name: 'Review access change', exact: true }).click();
  expect(requests.some(request => 'access_mode' in request)).toBe(false);
  await expect(page.getByRole('group', { name: 'Confirm access change', exact: true })).toContainText('no expiry');
  await page.getByRole('button', { name: 'Confirm access change', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Access updated');
  expect(requests.find(request => 'access_mode' in request)).toMatchObject({ target_id: account.id, access_mode: 'complimentary', access_until: null });
  await page.getByRole('button', { name: 'Usage & limits' }).click();
  await page.getByRole('button', { name: 'Cancel renewal', exact: true }).click();
  await page.getByLabel('Reason for subscription action').fill('Customer asked to stop renewal');
  expect(requests.some(request => request.action === 'admin_cancel')).toBe(false);
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Renewal cancellation confirmed');
  expect(requests.find(request => request.action === 'admin_cancel')).toMatchObject({ targetId: account.id, subscriptionId: 'sub_test123' });
  await page.getByLabel('Sort accounts').selectOption('storage');
  await expect.poll(() => requests.some(request => request.sort_by === 'storage')).toBe(true);
  await page.getByLabel('Search users by name or email').fill('missing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No users found. Try another search.')).toBeVisible();
  await expect(page.getByRole('table')).toContainText('0 matching accounts');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});
