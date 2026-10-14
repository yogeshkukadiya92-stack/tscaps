import { test, expect } from '@playwright/test';

const USER_ID = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
function token() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.test-signature`;
}
test('sign up validation, sign in, session restore, and sign out', async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key"};' }));
  await page.route('https://auth.example.test/**', route => {
    const url = route.request().url();
    if (url.includes('/token')) return route.fulfill({ contentType: 'application/json', json: {
      access_token: token(), refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
      user: { id: USER_ID, aud: 'authenticated', email: 'test@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    } });
    if (url.includes('/rest/v1/reelstudio_projects')) return route.fulfill({ contentType: 'application/json', json: [] });
    if (url.includes('/logout')) return route.fulfill({ contentType: 'application/json', json: {} });
    return route.fulfill({ status: 400, contentType: 'application/json', json: { error: 'Unexpected test request' } });
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Welcome to ReelStudio' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Test creator');
  await page.getByLabel('Email', { exact: true }).fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('strong-test-password');
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match.');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('strong-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await expect(page.getByText('test@example.test', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to ReelStudio' })).toBeVisible();
});

test('mobile auth page fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",emailEnabled:false};' }));
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Welcome to ReelStudio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('auth-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
