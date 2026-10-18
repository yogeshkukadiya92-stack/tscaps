import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions, setDocumentJson } from './support/editorBoot';
async function setup(page: Page, respond: () => { status?: number; json: unknown }) {
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
  await page.evaluate(async values => { await window.__tscapsE2E!.setVideo(new Blob([new Uint8Array(values)], { type: 'video/mp4' })); window.__tscapsE2E!.setVideoLayout(128, 128); }, [...bytes]);
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await setDocumentJson(page, doc);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save creative changes', exact: true }).click();
  await page.getByText('AI custom instructions · Credits', { exact: true }).click();
  return { requests: () => requests };
}

const plan = { style: 'energetic', preset: 'bold-talk', options: { pauses: true, zooms: true, polish: true, captions: true }, summary: 'Trim pauses and style captions.', limitations: ['No stock music is added.'] };
async function quote(page: Page) {
  await page.route('https://processing.example.test/ai-edit/quote**', route => route.fulfill({ json: { duration: 12, quality: 'standard', source_hash: 'a'.repeat(64)+':standard', credits: 3, charge: 3 } }));
  await page.getByLabel('Tell AI how to edit', { exact: false }).fill('Pauses કાપો અને bold captions ઉમેરો');
  await page.getByRole('button', { name: 'Estimate credits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create AI edit · 3 credits', exact: true })).toBeEnabled();
}
test('prompt builds an editable preview after a server credit estimate', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  let calls = 0;
  await page.route('https://processing.example.test/ai-edit', route => {
    calls++; const body = route.request().postDataJSON();
    expect(body.max_credits).toBe(3); expect(body.quality).toBe('standard'); expect(body.project_id).toBeTruthy();
    return route.fulfill({ json: plan });
  });
  await quote(page);
  await page.getByRole('button', { name: 'Create AI edit · 3 credits', exact: true }).click();
  await expect(page.getByLabel('Auto Edit plan', { exact: true })).toBeVisible();
  await expect(page.getByText(plan.summary, { exact: true })).toBeVisible();
  await expect(page.getByText(plan.limitations[0], { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create AI edit · 0 credits', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('ai-edit-mobile.png') });
  await page.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Auto Edit', exact: true })).toContainText('Energetic auto edit applied');
  expect(calls).toBe(1);
});
test('insufficient credits preserves the project and offers credit balance', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  await page.route('https://processing.example.test/ai-edit', route => route.fulfill({ status: 402, json: { detail: 'Buy credits' } }));
  await quote(page);
  await page.getByRole('button', { name: 'Create AI edit · 3 credits', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Auto Edit', exact: true }).getByRole('alert')).toContainText('Not enough AI credits');
  await expect(page.getByLabel('Auto Edit plan', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check credits', exact: true })).toBeEnabled();
});

test('high quality shows twice the credits and pricing stays unavailable until configured', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  await page.route('https://processing.example.test/ai-edit/quote**', route => {
    expect(new URL(route.request().url()).searchParams.get('quality')).toBe('high');
    return route.fulfill({ json: { duration: 23, quality: 'high', source_hash: 'b'.repeat(64)+':high', credits: 10, charge: 10 } });
  });
  await page.route('https://auth.example.test/functions/v1/reelstudio-credits', route => route.fulfill({ json: { balance: 0, pack: null } }));
  await page.getByLabel('AI quality', { exact: true }).selectOption('high');
  await page.getByLabel('Tell AI how to edit', { exact: false }).fill('Make a professional reel');
  await page.getByRole('button', { name: 'Estimate credits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create AI edit · 10 credits', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Check credits', exact: true }).click();
  await expect(page.getByText('Available: 0 credits', { exact: true })).toBeVisible();
  await expect(page.getByText('Credit pricing will be available soon.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(0);
});

test('credit checkout waits for verified payment before showing balance', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  let verified = false;
  await page.route('https://auth.example.test/functions/v1/reelstudio-credits', route => {
    const request = route.request().postDataJSON();
    if (request.action === 'status') return route.fulfill({ json: { balance: verified ? 10 : 0, pack: { credits: 10, amount: 1000 } } });
    if (request.action === 'create') return route.fulfill({ json: { keyId: 'public-test', orderId: 'order_test', credits: 10, amount: 1000 } });
    expect(request).toMatchObject({ action: 'verify', orderId: 'order_test', paymentId: 'pay_test', signature: 'test-signature' });
    verified = true; return route.fulfill({ json: { credited: true } });
  });
  await page.evaluate(() => {
    Object.assign(window, { Razorpay: class {
      constructor(private options: { handler: (value: unknown) => void; order_id: string }) {}
      open() { if (this.options.order_id !== 'order_test') throw new Error('Incorrect checkout'); this.options.handler({ razorpay_payment_id: 'pay_test', razorpay_signature: 'test-signature' }); }
      on() {}
    } });
  });
  await page.getByRole('button', { name: 'Check credits', exact: true }).click();
  await page.getByRole('button', { name: 'Buy 10 credits · ₹10.00', exact: true }).click();
  await expect(page.getByText('Available: 10 credits', { exact: true })).toBeVisible();
  expect(verified).toBe(true);
});

test('ready editing skills prepare and apply without a prompt or paid AI calls', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  let paidCalls = 0;
  await page.route('**/ai-edit**', route => { paidCalls++; return route.abort(); });
  await expect(page.getByLabel('Tell AI how to edit', { exact: false })).toHaveValue('');
  await page.getByRole('button', { name: 'Preview Cinematic', exact: true }).click();
  const draft = page.getByLabel('Auto Edit plan', { exact: true });
  await expect(draft).toBeVisible();
  await expect(draft).toContainText('2 lighting / elements');
  await page.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Auto Edit', exact: true })).toContainText('Template: Cinema Diary');
  await page.getByRole('button', { name: 'Preview Gentle zooms', exact: true }).click();
  await expect(draft).toContainText('0 lighting / elements');
  await expect(draft).toContainText('0 pause cuts');
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Auto Edit', exact: true })).toContainText('Template: Cinema Diary');
  expect(paidCalls).toBe(0);
  await page.getByRole('group', { name: 'Ready editing skills' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('ready-skills-mobile.png'), animations: 'disabled' });
});

 test('professional studio has working tool panels and responsive timeline', async ({ page }) => {
  await setup(page, () => ({ json: { words: [] } }));
  await page.getByText('AI custom instructions · Credits', { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tools = page.getByRole('navigation', { name: 'Creative tools' });
  await tools.getByRole('button', { name: 'Clips', exact: true }).click();
  await expect(page.getByLabel('Clip 1 start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.getByTestId('creative-clip')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Creative timeline' })).toContainText('2 video segments');
  await tools.getByRole('button', { name: 'Audio', exact: true }).click();
  await page.getByLabel('Normalize voice level', { exact: true }).check();
  await expect(page.getByLabel('Normalize voice level', { exact: true })).toBeChecked();
  await tools.getByRole('button', { name: 'Auto Edit', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search editing skills' }).fill('cinematic');
  await expect(page.getByRole('button', { name: 'Preview Cinematic', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Complete reel', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search editing skills' }).fill('');
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('professional-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('region', { name: 'Creative Studio', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('region', { name: 'Creative Studio', exact: true }).evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath(`professional-mobile-${width}.png`) });
  }
});

test('professional studio renders a downloadable reel after switching tools', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Look', exact: true }).click();
  await studio.getByRole('button', { name: 'Noir', exact: true }).click();
  await studio.getByText('Render & download', { exact: true }).click();
  await studio.getByLabel('Export format', { exact: true }).selectOption('webm');
  await studio.getByRole('button', { name: 'Render edited reel', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Download reel', exact: true })).toBeVisible({ timeout: 60000 });
  const downloadEvent = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download reel', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/reelstudio\.webm$/);
  const output = await readFile((await download.path())!);
  expect(output.length).toBeGreaterThan(1000);
  const duration = await page.evaluate(async data => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/webm' }));
    const video = document.createElement('video');
    try { return await new Promise<number>((resolve, reject) => { video.onloadedmetadata = () => resolve(video.duration); video.onerror = () => reject(new Error('Export cannot decode')); video.src = url; }); }
    finally { URL.revokeObjectURL(url); }
  }, [...output]);
  expect(duration).toBeGreaterThan(0);
});
