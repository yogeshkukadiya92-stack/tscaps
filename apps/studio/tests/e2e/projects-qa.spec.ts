import { test, expect, type Page } from '@playwright/test';

const USER = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
const rows = ['A very long project name '.repeat(12), 'Zebra reel'].map((name, index) => ({
  id: `project-${index}`, user_id: USER, name,
  created_at: '2026-10-01T00:00:00Z', updated_at: `2026-10-0${index + 1}T00:00:00Z`,
  has_document: true, thumbnail_data: null,
  video: { fileName: 'sample.mp4', mimeType: 'video/mp4', size: 1024, duration: 106 },
}));

async function setup(page: Page, list: () => { status?: number; json: unknown }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",billingEnabled:false};' }));
  await page.route('https://auth.example.test/**', route => {
    const url = route.request().url();
    if (url.includes('/token')) return route.fulfill({ json: { access_token: accessToken, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: USER, aud: 'authenticated', email: 'test@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    if (url.includes('rpc/reelstudio_is_admin')) return route.fulfill({ json: false });
    if (url.includes('/reelstudio_projects')) return route.fulfill(list());
    return route.fulfill({ json: {} });
  });
  await page.goto('/signin');
  await page.getByLabel('Email', { exact: true }).fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
}

test('failed project listing stops loading and can recover without reloading', async ({ page }) => {
  let failing = true;
  await setup(page, () => failing ? { status: 500, json: { message: 'Temporary outage' } } : { json: rows });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Loading projects', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Make your first project.', { exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.workspace-project-card')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('project dashboard handles search, sort, list view and narrow screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, () => ({ json: rows }));
  await expect(page.locator('.workspace-project-card')).toHaveCount(2);
  await page.getByLabel('Sort projects').selectOption('name');
  await expect(page.locator('.workspace-project-name').first()).toHaveText(rows[0]!.name);
  await page.getByRole('searchbox').fill('missing-' + 'x'.repeat(200));
  await expect(page.getByRole('status').filter({ hasText: 'No projects match' })).toBeVisible();
  for (const width of [320, 375, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.projects-workspace').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('searchbox').fill('');
    for (const mode of ['Grid view', 'List view']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      expect(await page.evaluate(() => {
        const pane = document.querySelector('.projects-workspace')!;
        return pane.scrollWidth <= pane.clientWidth;
      })).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`projects-${width}.png`) });
    await page.getByRole('searchbox').fill('missing-' + 'x'.repeat(200));
  }
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Project actions', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects$/);
  expect(errors).toEqual([]);
});
