import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",emailEnabled:false};' }));
});

test('public pages are accessible before sign in and link to separate account pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your voice. Your story. Worth watching.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Features' }).click();
  await expect(page).toHaveURL(/\/features$/);
  await expect(page.getByRole('heading', { name: 'Captions with personality' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing' }).click();
  await expect(page.getByText('₹399', { exact: false })).toBeVisible();
  await expect(page.getByText('₹799', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Start your 5-day trial' }).first().click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('heading', { name: 'Welcome to ReelStudio' })).toBeVisible();
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to ReelStudio' })).toBeVisible();
});

test('public routes fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/features', '/pricing', '/signin', '/signup']) {
    await page.goto(path);
    await expect(page.locator('#public-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
