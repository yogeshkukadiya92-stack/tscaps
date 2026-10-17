import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditor, setVideoBytes } from './support/editorBoot';

async function phoneSetup(page: Page, respond: () => { status?: number; json: unknown }) {
  const user = 'c3fe7a2e-b7a4-4cc2-bec2-245c5dcf5161';
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__REELSTUDIO_CONFIG__={supabaseUrl:"https://auth.example.test",supabaseAnonKey:"public-test-key",transcriptionUrl:"https://processing.example.test",billingEnabled:false};' }));
  await page.route('https://auth.example.test/**', route => {
    if (route.request().url().includes('/token')) return route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: user, aud: 'authenticated', email: 'phone@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    if (route.request().url().includes('rpc/reelstudio_is_admin')) return route.fulfill({ json: false });
    return route.fulfill({ json: [] });
  });
  let requests = 0;
  await page.route('https://processing.example.test/transcribe**', route => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get('language')).toBe('hi');
    expect(route.request().headers()['content-type']).toBe('audio/wav');
    return route.fulfill(respond());
  });
  await page.goto('/signin');
  await page.getByLabel('Email', { exact: true }).fill('phone@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await page.goto('/editor?e2e=1');
  await page.waitForFunction(() => window.__tscapsE2E?.ready === true);
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  await setVideoBytes(page, bytes);
  return { requests: () => requests };
}
const words = [{ text: 'आज', start: 0, end: 0.4 }, { text: 'video', start: 0.4, end: 0.8 }];

test.use({ isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { mobile: true } }));
});

test('phone server transcription avoids local model controls and opens Roman Hinglish captions', async ({ page }) => {
  const server = await phoneSetup(page, () => ({ json: { words } }));
  const dialog = page.getByRole('dialog', { name: 'Start your video' });
  await expect(dialog.getByText('No speech model needs to be downloaded to this device.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Large v3 Turbo|Accuracy · Medium|Balanced · Small/ })).toHaveCount(0);
  await expect(dialog.getByText('Advanced', { exact: true })).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('phone-server-start.png') });
  await dialog.getByTestId('start-flow-primary').click();
  await expect(page.getByRole('tablist', { name: 'Editor workspace', exact: true })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => window.__tscapsE2E!.documentWords().map(w => w.text))).toEqual(['aaj', 'video']);
  expect(server.requests()).toBe(1);
});

test('phone server failure shows a specific error and retry succeeds', async ({ page }) => {
  let failing = true;
  const server = await phoneSetup(page, () => failing ? { status: 503, json: { detail: 'Unavailable' } } : { json: { words } });
  await page.getByTestId('start-flow-primary').click();
  const dialog = page.getByRole('dialog', { name: 'Start your video' });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('alert')).not.toContainText('Something went wrong');
  await expect(dialog.getByTestId('start-flow-primary')).toBeEnabled();
  failing = false;
  await dialog.getByTestId('start-flow-primary').click();
  await expect(page.getByRole('tablist', { name: 'Editor workspace', exact: true })).toBeVisible({ timeout: 30000 });
  expect(server.requests()).toBe(2);
});


test('phone can replace a saved large local model with a smaller model while preserving Hinglish', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tscaps:transcribe-preference', JSON.stringify({ model: 'large-v3-turbo', backend: 'wasm', captionStyle: 'roman-hinglish' })));
  await page.setViewportSize({ width: 360, height: 800 });
  await bootEditor(page);
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  await setVideoBytes(page, bytes);
  const dialog = page.getByRole('dialog', { name: 'Start your video' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('local-phone-before-switch.png') });
  await expect(dialog.getByRole('button', { name: 'Mobile-friendly · Base', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mobile-friendly · Base', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Mobile-friendly · Base', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('Base is selected:', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Caption language & script', { exact: true })).toHaveValue('roman-hinglish');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tscaps:transcribe-preference')!))).toMatchObject({ model: 'base', backend: 'auto', captionStyle: 'roman-hinglish' });
});
