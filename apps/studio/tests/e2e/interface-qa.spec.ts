import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('inspect editor workspaces at desktop and phone sizes', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Video', 'Captions', 'Style', 'Music', 'Effects', 'Trim']) {
      await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name, exact: true }).click();
      if (name === 'Video') await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`${name}-${width}.png`) });
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      for (const button of await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button').all()) {
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      expect((await page.getByRole('button', { name: 'Back to dashboard' }).boundingBox())!.x).toBeGreaterThanOrEqual(0);
      expect(documentWidth).toBeLessThanOrEqual(width);
    }
  }
});

test('public routes fit small phones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ['/', '/features', '/pricing', '/signin', '/signup']) {
    await page.goto(path);
    await expect(page.locator('#public-content')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`public-${path.replaceAll('/', '') || 'home'}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});


test('editor keyboard controls, rename cancellation, themes and export dialog remain usable', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.locator('[data-tool="Captions"]').click();
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await expect(name).toBeEnabled();
  const original = await name.inputValue();
  await name.fill('This rename should be cancelled');
  await name.press('Escape');
  await expect(name).toHaveValue(original);
  await name.fill('Confirmed project name');
  await name.press('Enter');
  await expect(name).toHaveValue('Confirmed project name');
  await name.fill('  Confirmed project name  ');
  await name.press('Enter');
  await expect(name).toHaveValue('Confirmed project name');
  await name.fill('Another cancelled rename');
  await name.press('Escape');
  await expect(name).toHaveValue('Confirmed project name');

  const tools = page.getByRole('navigation', { name: 'Creative tools' });
  await tools.getByRole('button', { name: 'Captions', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(tools.getByRole('button', { name: 'Style', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tools.getByRole('button', { name: 'Style', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /Theme:/ }).click();
  await page.getByRole('button', { name: /Theme:/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('editor-dark.png') });
  await page.setViewportSize({ width: 320, height: 700 });
  const playhead = page.getByRole('slider', { name: 'Reel playhead', exact: true });
  await expect(playhead).toBeEnabled();
  await playhead.fill('0.5');
  await playhead.press('Home');
  await expect(playhead).toHaveValue('0');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('export-mobile-dark.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('failed save-and-leave keeps edits available and reports the failure on a small phone', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Save project', exact: true })).toHaveText('Save');
  await page.locator('[data-tool="Captions"]').click();
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await name.fill('Untitled');
  await name.press('Enter');
  await name.fill('   ');
  await name.press('Enter');
  await expect(name).toHaveValue('Untitled');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects') throw new DOMException('Test storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Back to dashboard', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Save and leave', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText("Your changes couldn't be saved.");
  await expect(dialog.getByRole('button', { name: 'Save and leave', exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('save-failure-mobile.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(name).toHaveValue('Untitled');
});

test('caption sections remain reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  for (const label of ['Choose style', 'Transcript', 'Typography', 'Colors', 'Position', 'Motion', 'Effects', 'Layout', 'Code']) {
    await page.getByRole('button', { name: 'All tools', exact: true }).click();
    const names: Record<string, string> = { Transcript: 'Edit words', Motion: 'Animation' };
    await page.getByRole('dialog', { name: 'All tools' }).getByRole('button', { name: names[label] ?? label, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: label, exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`section-${label}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});

test('admin table, search and edit form fit long account details on a phone', async ({ page }) => {
  const user = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  const email = 'long.account.name.'.repeat(10) + '@example.test';
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",billingEnabled:false};' }));
  await page.route('https://auth.example.test/**', route => {
    const url = route.request().url();
    if (url.includes('/token')) return route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: user, aud: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    if (url.includes('rpc/reelstudio_is_admin')) return route.fulfill({ json: true });
    if (url.includes('rpc/reelstudio_admin_usage')) return route.fulfill({ json: { users: [{ id: 'other-user', email, display_name: 'A long display name '.repeat(5), is_admin: false, created_at: '2026-10-01T00:00:00Z', last_sign_in_at: null, projects: 1, deleted_projects: 0, captioned_projects: 1, video_seconds: 60, stored_videos: 1, storage_bytes: 1048576, exports: 0, export_failures: 0, processed_videos: 0, transcriptions: 0, last_active_at: null, cloud_enabled: true, project_limit: null, storage_limit_bytes: null, credit_balance: null, billing: null }], total_count: 1, summary: { users: 1, active_users: 0, projects: 1, storage_bytes: 1048576, exports: 0 }, credits_available: false, billing_available: false, server_now: new Date().toISOString(), audit: [] } });
    if (url.includes('/reelstudio_projects')) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/signin');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await page.getByRole('button', { name: 'Admin panel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit user', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Edit user', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('admin-mobile.png') });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Edit user', exact: true })).toHaveCount(0);
});

test('beginner tool menu is keyboard accessible and fits a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  const guide = page.getByRole('dialog', { name: 'All tools' });
  const toggle = page.getByRole('button', { name: 'All tools', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('searchbox')).toBeFocused();
  await expect(guide).toContainText('Voice & music');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('beginner-tools-phone.png') });
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
});

test('Space activates focused controls without triggering global playback', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await expect(page.getByRole('button', { name: 'All tools', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'All tools', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: 'All tools' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'All tools' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Stop preview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: 'Export video', exact: true })).toBeVisible();
});

test('save failure notices leave the mobile editing tools reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  const save = page.getByRole('button', { name: 'Save project', exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(save).toHaveText('Save');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects') throw new DOMException('Test storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await name.fill('Unsaved edit');
  await name.press('Enter');
  await save.click();
  const notice = page.getByRole('status').filter({ hasText: "Couldn't save your project" });
  await expect(notice).toBeVisible();
  const tools = page.getByRole('navigation', { name: 'Creative tools' });
  await expect.poll(async () => (await notice.boundingBox())!.y + (await notice.boundingBox())!.height).toBeLessThanOrEqual((await tools.boundingBox())!.y);
  await tools.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(tools.getByRole('button', { name: 'Music', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('save-notice-mobile.png') });
});
