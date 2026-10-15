import { test, expect, type Page } from '@playwright/test';

const USER = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
const current = () => Date.now();
function access(allowed: boolean, paid = false) {
  return { allowed, server_now: new Date(current()).toISOString(), trial_ends_at: new Date(current() + (allowed && !paid ? 5 : -1) * 86400000).toISOString(),
    paid_until: paid ? new Date(current() + 30 * 86400000).toISOString() : null, is_admin: false,
    subscription: paid ? { id: 'sub_test', status: 'active', current_end: new Date(current() + 30 * 86400000).toISOString(), cancel_at_cycle_end: false } : null };
}
function token() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER, aud: 'authenticated', role: 'authenticated', exp: Math.floor(current()/1000)+3600, iat: Math.floor(current()/1000) })}.test`;
}
async function setup(page: Page, getStatus: () => unknown, action?: (body: { action: string }) => unknown) {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",billingEnabled:true};' }));
  await page.route('https://auth.example.test/**', route => {
    const url = route.request().url();
    if (url.includes('/token')) return route.fulfill({ json: { access_token: token(), refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: USER, aud: 'authenticated', email: 'test@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    if (url.includes('rpc/reelstudio_billing_status')) return route.fulfill({ json: getStatus() });
    if (url.includes('rpc/reelstudio_is_admin')) return route.fulfill({ json: false });
    if (url.includes('/reelstudio_projects')) return route.fulfill({ json: [] });
    if (url.includes('/functions/v1/reelstudio-billing')) return route.fulfill({ json: action?.(route.request().postDataJSON()) ?? {} });
    return route.fulfill({ status: 400, json: { error: 'Unexpected test request' } });
  });
  await page.goto('/projects');
  await page.getByLabel('Email', { exact: true }).fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
}

test('five-day trial survives refresh and shows monthly pricing without charging', async ({ page }) => {
  let calls = 0;
  await setup(page, () => access(true), () => { calls++; return {}; });
  await expect(page.getByText(/5-day free trial/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Subscription', exact: true }).click();
  await expect(page.getByText('₹799', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Subscribe ·/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/5-day free trial/)).toBeVisible();
  expect(calls).toBe(0);
});

test('expired trial blocks direct editor URLs and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, () => access(false));
  await expect(page.getByRole('heading', { name: 'Your free trial has ended' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  await page.goto('/editor');
  await expect(page.getByRole('button', { name: 'Subscribe · ₹799/month', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/reelstudio-billing-mobile.png' });
});

test('checkout callback waits for server verification before unlocking', async ({ page }) => {
  let paid = false;
  const calls: string[] = [];
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.Razorpay=class {constructor(options){this.options=options}on(){}open(){this.options.handler({razorpay_subscription_id:'sub_test',razorpay_payment_id:'pay_test',razorpay_signature:'test-signature'})}};` }));
  await setup(page, () => access(paid, paid), body => {
    calls.push(body.action);
    if (body.action === 'create') return { keyId: 'rzp_test_public', subscriptionId: 'sub_test' };
    if (body.action === 'verify') { paid = true; return access(true, true); }
    return {};
  });
  await page.getByRole('button', { name: 'Subscribe · ₹799/month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  expect(calls).toEqual(['create','verify']);
});

test('authenticated mandate without paid access remains locked', async ({ page }) => {
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.Razorpay=class {constructor(options){this.options=options}on(){}open(){this.options.handler({razorpay_subscription_id:'sub_test',razorpay_payment_id:'pay_test',razorpay_signature:'test-signature'})}};` }));
  await setup(page, () => access(false), body => body.action === 'create' ? { keyId: 'rzp_test_public', subscriptionId: 'sub_test' } : access(false));
  await page.getByRole('button', { name: 'Subscribe · ₹799/month', exact: true }).click();
  await expect(page.getByText(/Access opens as soon as Razorpay confirms/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toHaveCount(0);
});

test('paid subscriber can cancel renewal while retaining paid access', async ({ page }) => {
  let cancelled = false;
  await setup(page, () => { const value = access(true, true); value.subscription!.cancel_at_cycle_end = cancelled; return value; }, body => {
    if (body.action === 'cancel') cancelled = true;
    return access(true,true);
  });
  await page.getByRole('button', { name: 'Subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByText(/Renewal cancelled/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
});

test('weekly selection sends the weekly plan and shows INR 399 recurring checkout', async ({ page }) => {
  let chosen = '';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.Razorpay=class {constructor(options){this.options=options}on(){}open(){document.body.dataset.checkoutDescription=this.options.description;this.options.modal.ondismiss()}};` }));
  await setup(page, () => access(false), body => {
    chosen = (body as { action: string; plan: string }).plan;
    return { keyId: 'rzp_test_public', subscriptionId: 'sub_weekly' };
  });
  await page.getByRole('radio', { name: /Weekly/ }).check();
  await expect(page.getByText(/Renews weekly/)).toBeVisible();
  await page.screenshot({ path: '/tmp/reelstudio-weekly-plan.png' });
  await page.getByRole('button', { name: 'Subscribe · ₹399/week', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-checkout-description', 'Weekly subscription · ₹399/week');
  expect(chosen).toBe('weekly');
  await page.getByRole('radio', { name: /Monthly/ }).check();
  await expect(page.getByRole('button', { name: 'Subscribe · ₹799/month', exact: true })).toBeVisible();
});
