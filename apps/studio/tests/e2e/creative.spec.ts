import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

function musicWav() {
  const samples = 48000, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 48000) * 8000), 44 + i * 2);
  return { name: 'music.wav', mimeType: 'audio/wav', buffer: wav };
}
async function selectEncodableFormat(page: Page, dialog: ReturnType<Page['getByRole']>): Promise<'mp4' | 'webm'> {
  // Linux's Chromium can lack AAC encoding. Keep the same pixel/audio assertions
  // and exercise WebM there, rather than waiting for an impossible MP4 download.
  const aac = process.env['E2E_FORCE_WEBM'] !== '1' && await page.evaluate(async () => {
    const scope = globalThis as unknown as { AudioEncoder?: { isConfigSupported(config: object): Promise<{ supported?: boolean }> } };
    try {
      return !!(await scope.AudioEncoder?.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }))?.supported;
    } catch { return false; }
  });
  const format = aac ? 'mp4' : 'webm';
  const picker = dialog.getByLabel('Export format', { exact: true });
  if (!await picker.isVisible()) await dialog.getByText('Render & download', { exact: true }).click();
  await picker.selectOption(format);
  return format;
}
async function openTool(workspace: ReturnType<Page['getByRole']>, name: string) {
  await workspace.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name, exact: true }).click();
  if (name === 'Auto Edit') {
    const advanced = workspace.locator('details').filter({ hasText: 'Templates & advanced settings' });
    if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
  }
}

async function openStudio(page: Page) {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  const dialog = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await expect(page.getByRole('dialog', { name: 'Creative Studio' })).toHaveCount(0);
  await expect(dialog.getByRole('navigation', { name: 'Creative tools' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  const canvas = await dialog.locator('canvas').boundingBox();
  const playhead = await dialog.getByLabel('Reel playhead', { exact: true }).boundingBox();
  expect(canvas).not.toBeNull();
  expect(playhead).not.toBeNull();
  expect(playhead!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height);
  const format = await selectEncodableFormat(page, dialog);
  return { dialog, bytes, format };
}
async function storedProject(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('tscaps'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<{ id: string; payload: { sheets: { templateId: string }[]; creative: { autoEdit?: { style: string; preset?: string }; settings: { text: string }; music: { key: string }; clips: unknown[]; overlays: unknown[] } } }>((resolve, reject) => {
      const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result[0]); r.onerror = () => reject(r.error);
    }); } finally { db.close(); }
  });
}
async function decode(page: Page, output: Buffer) {
  return page.evaluate(async array => {
    const blob = new Blob([new Uint8Array(array)]), video = document.createElement('video');
    const url = URL.createObjectURL(blob); video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Cannot decode export')); });
    await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = 0.1; });
    const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight;
    const painter = frame.getContext('2d')!; painter.drawImage(video, 0, 0);
    const pixel = Array.from(painter.getImageData(Math.floor(frame.width * 0.8), Math.floor(frame.height * 0.2), 1, 1).data);
    const ctx = new AudioContext(); const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const result = { pixel, width: video.videoWidth, height: video.videoHeight, videoDuration: video.duration, duration: audio.duration, rms: Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length) };
    await ctx.close(); URL.revokeObjectURL(url); return result;
  }, Array.from(output));
}

test('creative settings, music, clips and B-roll survive a full project reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const { dialog, bytes } = await openStudio(page);
  await openTool(dialog, 'Look');
  await dialog.getByRole('button', { name: 'Noir', exact: true }).click();
  await openTool(dialog, 'Look');
  await dialog.getByRole('textbox', { name: 'Text', exact: true }).fill('Saved creative title');
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Add clips', { exact: true }).setInputFiles({ name: 'extra.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'B-roll');
  await dialog.getByLabel('Add B-roll', { exact: true }).setInputFiles({ name: 'b-roll.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'B-roll');
  await dialog.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Voice cleanup · rumble filter & noise gate').check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/ReelStudio/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const saved = await storedProject(page);
  expect(saved.payload.creative.settings.text).toBe('Saved creative title');
  expect(saved.payload.creative.clips).toHaveLength(2); expect(saved.payload.creative.overlays).toHaveLength(1);
  expect(saved.payload.creative.music.key).toContain('/creative/');
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  await openTool(dialog, 'Look');
  await expect(dialog.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue('Saved creative title');
  await openTool(dialog, 'Audio');
  await expect(dialog.getByText('music.wav', { exact: true })).toBeVisible();
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await openTool(dialog, 'Audio');
  await expect(dialog.getByLabel('Voice cleanup · rumble filter & noise gate')).toBeChecked();
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Stop preview' })).toBeVisible();
  await expect.poll(async () => Number(await dialog.getByLabel('Reel playhead', { exact: true }).inputValue())).toBeGreaterThan(0.1);
  await dialog.getByRole('button', { name: 'Stop preview' }).click();
  await page.screenshot({ path: '/tmp/reelstudio-creative-desktop.png' });
  expect(errors).toEqual([]);
});

test('unified export includes added clips, portrait FHD, captions and audible music', async ({ page }) => {
  test.setTimeout(180000);
  const { dialog, bytes, format } = await openStudio(page);
  await openTool(dialog, 'Look');
  await dialog.getByLabel('Portrait canvas · 1080 × 1920').check();
  await openTool(dialog, 'Look');
  await dialog.getByRole('textbox', { name: 'Text', exact: true }).fill('ONE FINAL EXPORT');
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Add clips', { exact: true }).setInputFiles({ name: 'extra.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'B-roll');
  await dialog.getByLabel('Add B-roll', { exact: true }).setInputFiles({ name: 'b-roll.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'B-roll');
  await dialog.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Clip 1 end', { exact: true }).fill('0.5');
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Clip 2 end', { exact: true }).fill('0.5');
  await openTool(dialog, 'Audio');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).fill('0');
  await openTool(dialog, 'Audio');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).press('Enter');
  await dialog.getByRole('button', { name: 'Render edited reel' }).click();
  await expect(dialog.getByRole('button', { name: 'Download reel' })).toBeVisible({ timeout: 120000 });
  const downloading = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download reel' }).click();
  const download = await downloading; await download.saveAs(`/tmp/reelstudio-unified.${format}`); const output = await readFile((await download.path())!);
  const stats = await decode(page, output);
  expect(stats.width).toBe(1080); expect(stats.height).toBe(1920);
  // This location is black in the letterboxed original; the timed picture-in-picture paints it.
  expect(Math.max(...stats.pixel.slice(0, 3))).toBeGreaterThan(100);
  expect(Math.abs(stats.videoDuration - 1)).toBeLessThan(0.1);
  // AAC encoders may include up to a few priming/padding packets in decoded PCM.
  expect(Math.abs(stats.duration - 1)).toBeLessThan(0.1); expect(stats.rms).toBeGreaterThan(0.01);
  // Main Export must use the same composition, rather than silently exporting the original.
  await page.evaluate(async selectedFormat => { await window.__tscapsE2E!.triggerExport(selectedFormat); }, format);
  const mainBytes = await page.evaluate(async () => {
    const result = window.__tscapsE2E!.lastResult!;
    if ('error' in result) throw new Error(result.error);
    return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
  });
  const main = await decode(page, Buffer.from(mainBytes));
  expect(main.width).toBe(1080); expect(main.height).toBe(1920); expect(Math.abs(main.videoDuration - 1)).toBeLessThan(0.1); expect(Math.abs(main.duration - 1)).toBeLessThan(0.1);
});

test('unsupported AAC explains MP4 failure and WebM still exports audible video', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = globalThis as unknown as { AudioEncoder?: { isConfigSupported(config: { codec: string }): Promise<unknown> } };
    const encoder = scope.AudioEncoder;
    if (!encoder) return;
    const original = encoder.isConfigSupported.bind(encoder);
    encoder.isConfigSupported = async config => config.codec.startsWith('mp4a')
      ? { supported: false, config } : original(config);
  });
  const { dialog } = await openStudio(page);
  await dialog.getByLabel('Export format', { exact: true }).selectOption('mp4');
  await dialog.getByRole('button', { name: 'Render edited reel', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('This browser cannot encode MP4');
  await dialog.getByLabel('Export format', { exact: true }).selectOption('webm');
  await dialog.getByRole('button', { name: 'Render edited reel', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Download reel', exact: true })).toBeVisible({ timeout: 60000 });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download reel', exact: true }).click();
  const bytes = await readFile((await (await downloading).path())!);
  const result = await decode(page, bytes);
  expect(result.width).toBe(128); expect(result.height).toBe(128);
  expect(result.rms).toBeGreaterThan(0.01);
});

test('mobile split, reorder, undo, cancellation and music-only export', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openStudio(page);
  await openTool(dialog, 'Clips');
  await dialog.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await dialog.getByTestId('creative-clip').nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(dialog.getByLabel('Clip 1 start', { exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(dialog.getByLabel('Clip 1 start', { exact: true })).toHaveValue('0');
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await openTool(dialog, 'Audio');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).fill('0');
  await openTool(dialog, 'Audio');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).press('Enter');
  await openTool(dialog, 'Timing');
  await dialog.getByRole('textbox', { name: 'Speed value' }).fill('2');
  await openTool(dialog, 'Timing');
  await dialog.getByRole('textbox', { name: 'Speed value' }).press('Enter');
  await dialog.evaluate(el => { el.scrollTop = 0; });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.screenshot({ path: '/tmp/reelstudio-creative-mobile.png' });
  await dialog.getByRole('button', { name: 'Render edited reel' }).click();
  await dialog.getByRole('button', { name: 'Cancel export' }).click();
  await expect(dialog.getByRole('button', { name: 'Render edited reel' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Download reel' })).not.toBeVisible();
  await dialog.getByLabel('Export format', { exact: true }).selectOption('webm');
  await dialog.getByRole('button', { name: 'Render edited reel' }).click();
  await expect(dialog.getByRole('button', { name: 'Download reel' })).toBeVisible({ timeout: 60000 });
  const downloading = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download reel' }).click();
  const download = await downloading;
  const stats = await decode(page, await readFile((await download.path())!));
  expect(stats.rms).toBeGreaterThan(0.01); expect(stats.duration).toBeCloseTo(1, 1);
});

test('missing local music reports the file and replacement restores the saved project', async ({ page }) => {
  const { dialog } = await openStudio(page);
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  const saved = await storedProject(page);
  await page.evaluate(async key => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('reelstudio-creative-media'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  }, saved.payload.creative.music.key);
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(dialog.getByRole('alert')).toContainText('Missing media: music.wav');
  await openTool(dialog, 'Audio');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('alert')).not.toBeVisible();
  expect((await storedProject(page)).payload.creative.music.key).not.toBe(saved.payload.creative.music.key);
});

for (const name of ['Digital Zoom', 'Checklist', 'Phone Mockup', 'Headline Wall', 'Chart Grow', 'Pull-back Reveal', 'Cover Story', 'Zoom-through Cut']) {
  test(`motion ${name}: preview matches encoded export and survives save`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const { dialog } = await openStudio(page);
    if (name === 'Phone Mockup') { await openTool(dialog, 'Look'); await dialog.getByLabel('Portrait canvas · 1080 × 1920').check(); }
    if (name === 'Zoom-through Cut') { await openTool(dialog, 'Clips'); await dialog.getByRole('button', { name: 'Split', exact: true }).click(); }
    await openTool(dialog, 'Effects');
    await dialog.getByRole('button', { name: `Add ${name}`, exact: true }).click();
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    const sampleTime = name === 'Zoom-through Cut' ? 0.9 : 0.7;
    const playhead = dialog.getByLabel('Reel playhead', { exact: true });
    await playhead.fill(String(sampleTime));
    // Wait for asynchronous frame decoding and capture a full normalized pixel reference.
    await page.waitForTimeout(400);
    const previewPixels = await dialog.locator('canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height, pixels: Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) }));
    await dialog.getByRole('button', { name: 'Render edited reel' }).click();
    await expect(dialog.getByRole('button', { name: 'Download reel' })).toBeVisible({ timeout: 60000 });
    const downloading = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download reel' }).click();
    const bytes = await readFile((await (await downloading).path())!);
    const difference = await page.evaluate(async ({ data, expected, at }) => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)]));
      const video = document.createElement('video'); video.src = url;
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Decode failed')); });
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = at + 0.001; });
      const canvas = document.createElement('canvas'); canvas.width = expected.width; canvas.height = expected.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (actual.length !== expected.pixels.length) throw new Error('Preview/export dimensions differ');
      let sum = 0; for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) sum += Math.abs(actual[i]! - expected.pixels[i]!);
      URL.revokeObjectURL(url); return sum / (actual.length / 4 * 3);
    }, { data: Array.from(bytes), expected: previewPixels, at: sampleTime });
    expect(difference).toBeLessThan(12); // H.264 is lossy; compare whole-frame mean RGB error.
    const saved = await storedProject(page);
    await page.goto(`/project/${saved.id}?e2e=1`);
    await page.getByRole('tab', { name: 'Creative', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(1);
    await expect(dialog.getByTestId('motion-effect')).toContainText(name);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    if (name === 'Checklist') {
      await openTool(dialog, 'Effects');
      await dialog.getByRole('button', { name: 'Preview effect', exact: true }).click();
      await page.waitForTimeout(300);
      await openTool(dialog, 'Effects');
      await dialog.getByRole('heading', { name: 'Motion Effects', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/reelstudio-motion-effects-desktop.png', timeout: 10000 });
      await page.setViewportSize({ width: 390, height: 844 });
      // The editor remounts its panel when crossing the mobile breakpoint.
      await page.getByRole('tab', { name: 'Creative', exact: true }).click();
      await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
      await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await openTool(dialog, 'Effects');
      await dialog.getByRole('heading', { name: 'Motion Effects', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/reelstudio-motion-effects-mobile.png', timeout: 10000 });
    }
    expect(errors).toEqual([]);
  });
}


for (const style of ['Clean', 'Energetic', 'Professional']) {
  test(`Auto Edit ${style} supports preview, undo, manual changes and project reload`, async ({ page }) => {
    if (style === 'Professional') await page.setViewportSize({ width: 390, height: 844 });
    const { dialog } = await openStudio(page);
    const panel = dialog.getByRole('region', { name: 'Auto Edit', exact: true });
    const wordsBefore = await page.evaluate(() => window.__tscapsE2E!.documentWords());
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('group', { name: 'Auto Edit style', exact: true }).getByRole('button', { name: new RegExp(`^${style}`) }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('button', { name: 'Apply auto edit', exact: true })).toBeEnabled();
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(0);
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText(`${style} auto edit applied`);
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.__tscapsE2E!.documentWords())).toEqual(wordsBefore);

    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('button', { name: 'Analyze auto edit', exact: true })).toBeVisible();
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText(`${style} auto edit applied`);

    await openTool(dialog, 'Effects');
    await dialog.getByLabel('Effect 1 start', { exact: true }).fill('0.3');
    await openTool(dialog, 'Look');
    await dialog.getByRole('button', { name: 'Noir', exact: true }).click();
    await openTool(dialog, 'Clips');
    await dialog.getByLabel('Clip 1 end', { exact: true }).fill('1.5');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
    const saved = await storedProject(page);
    await page.goto(`/project/${saved.id}?e2e=1`);
    await page.getByRole('tab', { name: 'Creative', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText(`${style} auto edit applied`);
    await openTool(dialog, 'Effects');
    await expect(dialog.getByLabel('Effect 1 start', { exact: true })).toHaveValue('0.3');
    await openTool(dialog, 'Clips');
    await expect(dialog.getByLabel('Clip 1 end', { exact: true })).toHaveValue('1.5');
    await openTool(dialog, 'Look');
    await expect(dialog.getByRole('button', { name: 'Noir', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('button', { name: 'Analyze auto edit', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    if (style === 'Energetic') {
      await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/reelstudio-auto-edit-desktop.png' });
    }
  });
}


test('Auto Edit detects real quiet audio and each generated pause cut can be adjusted or restored', async ({ page }) => {
  // Four seconds of tone with a two-second quiet middle; words flank the pause.
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = { sections: [{ kind: 'main', segments: [{ lines: [{ words: [
    { text: 'Before', start: 0.2, end: 0.8 }, { text: 'After', start: 3.2, end: 3.8 },
  ] }] }] }] };
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  const workspace = page.getByRole('region', { name: 'Creative Studio', exact: true });
  const panel = workspace.getByRole('region', { name: 'Auto Edit', exact: true });
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByLabel('Auto Edit plan')).toContainText('1 pause cuts');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(workspace.getByTestId('pause-cut')).toHaveCount(1);
  const start = workspace.getByLabel('Pause cut 1 start', { exact: true });
  const end = workspace.getByLabel('Pause cut 1 end', { exact: true });
  expect(Number(await start.inputValue())).toBeGreaterThan(0.8);
  expect(Number(await end.inputValue())).toBeLessThan(3.2);
  await openTool(workspace, 'Timing');
  await start.fill('1.4');
  await workspace.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(workspace.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  const saved = await storedProject(page);
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(start).toHaveValue('1.4');
  await openTool(workspace, 'Timing');
  await workspace.getByRole('button', { name: 'Restore pause cut 1', exact: true }).click();
  await expect(workspace.getByTestId('pause-cut')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(workspace.getByTestId('pause-cut')).toHaveCount(1);
  await expect(start).toHaveValue('1.4');
});


for (const recipe of [
  { name: 'Bold Talking Head', id: 'bold-talk', template: 'scene-boldface', style: 'Energetic' },
  { name: 'Podcast Clip', id: 'podcast', template: 'scene-podcast-cutout', style: 'Clean' },
  { name: 'Storytelling', id: 'storytelling', template: 'scene-storyline', style: 'Clean' },
  { name: 'Quick Tips', id: 'quick-tips', template: 'scene-karaoke', style: 'Energetic' },
  { name: 'Business & Education', id: 'business', template: 'scene-swiss', style: 'Professional' },
]) {
  test(`Reel recipe ${recipe.name} applies its caption look and survives reload`, async ({ page }) => {
    if (recipe.id === 'business') await page.setViewportSize({ width: 390, height: 844 });
    const { dialog } = await openStudio(page);
    const panel = dialog.getByRole('region', { name: 'Auto Edit', exact: true });
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('searchbox', { name: 'Search reel templates' }).fill(recipe.name);
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: `Use ${recipe.name} template`, exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('group', { name: 'Auto Edit style', exact: true }).getByRole('button', { name: new RegExp(`^${recipe.style}`) })).toHaveAttribute('aria-pressed', 'true');
    if (recipe.id === 'bold-talk') await page.screenshot({ path: '/tmp/reelstudio-reel-templates.png' });
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByLabel('Auto Edit plan')).toContainText('1 caption styles');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText(`Template: ${recipe.name}`);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
    const saved = await storedProject(page);
    expect(saved.payload.sheets[0]!.templateId).toBe(recipe.template);
    expect(saved.payload.creative.autoEdit?.preset).toBe(recipe.id);
    await page.goto(`/project/${saved.id}?e2e=1`);
    await page.getByRole('tab', { name: 'Creative', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText(`Template: ${recipe.name}`);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    if (recipe.id === 'quick-tips') {
      await selectEncodableFormat(page, dialog);
      await dialog.getByRole('button', { name: 'Render edited reel', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Download reel', exact: true })).toBeVisible({ timeout: 60000 });
      const downloadPromise = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Download reel', exact: true }).click();
      const download = await downloadPromise;
      const output = await readFile((await download.path())!);
      const result = await decode(page, output);
      expect(result.width).toBe(128); expect(result.height).toBe(128);
      expect(result.rms).toBeGreaterThan(0.01);
    }
  });
}

async function chooseAutoStyle(workspace: ReturnType<Page['getByRole']>, name: string) {
  const panel = workspace.getByRole('region', { name: 'Auto Edit', exact: true });
  await openTool(workspace, 'Auto Edit');
  await panel.getByRole('group', { name: 'Auto Edit style', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await openTool(workspace, 'Auto Edit');
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await openTool(workspace, 'Auto Edit');
  await expect(panel.getByRole('button', { name: 'Apply auto edit', exact: true })).toBeEnabled();
  return panel;
}

test('saved Auto Edit styles can be replaced after reload while manual edits survive', async ({ page }) => {
  const { dialog } = await openStudio(page);
  let panel = await chooseAutoStyle(dialog, 'Clean');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  const saved = await storedProject(page);
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  panel = await chooseAutoStyle(dialog, 'Energetic');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(dialog.getByTestId('motion-effect')).toHaveCount(1);
  await expect(dialog.getByLabel('Effect 1 intensity', { exact: true })).toHaveValue('0.3');
  await openTool(dialog, 'Effects');
  await dialog.getByLabel('Effect 1 start', { exact: true }).fill('0.3');
  await openTool(dialog, 'Look');
  await dialog.getByRole('button', { name: 'Noir', exact: true }).click();
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Clip 1 end', { exact: true }).fill('1.5');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  panel = await chooseAutoStyle(dialog, 'Professional');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await openTool(dialog, 'Effects');
  await expect(dialog.getByLabel('Effect 1 start', { exact: true })).toHaveValue('0.3');
  await expect(dialog.getByLabel('Effect 1 intensity', { exact: true })).toHaveValue('0.3');
  await openTool(dialog, 'Clips');
  await expect(dialog.getByLabel('Clip 1 end', { exact: true })).toHaveValue('1.5');
  await openTool(dialog, 'Look');
  await expect(dialog.getByRole('button', { name: 'Noir', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByRole('status')).toContainText('Professional auto edit applied');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByRole('status')).toContainText('Energetic auto edit applied');
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`draft Before/After preview is isolated and discardable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { dialog } = await openStudio(page);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
    const savedBefore = await storedProject(page);
    const panel = await chooseAutoStyle(dialog, 'Energetic');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Preview before / after', exact: true }).click();
    const version = dialog.getByRole('group', { name: 'Preview version', exact: true });
    await expect(version.getByRole('button', { name: 'After', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    const playhead = dialog.getByLabel('Reel playhead', { exact: true });
    await playhead.fill('1');
    const getPixels = () => dialog.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data));
    // Toggle once to wait for the canvas to paint the retained playhead during session preparation.
    await version.getByRole('button', { name: 'Before', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    const beforePixels = await getPixels();
    await version.getByRole('button', { name: 'After', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    expect(await getPixels()).not.toEqual(beforePixels);
    expect(Number(await playhead.inputValue())).toBeGreaterThan(0.95);
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(0);
    expect((await storedProject(page)).payload).toEqual(savedBefore.payload);
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Render edited reel', exact: true })).toBeDisabled();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(version).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    expect(Number(await playhead.inputValue())).toBeGreaterThan(0.95);
    await expect(dialog.getByTestId('motion-effect')).toHaveCount(0);
  });
}

test('preview retains its playhead after edits and clamps it when the reel is shortened', async ({ page }) => {
  const { dialog } = await openStudio(page);
  const playhead = dialog.getByLabel('Reel playhead', { exact: true });
  await playhead.fill('1.2');
  const before = Number(await playhead.inputValue());
  await openTool(dialog, 'Look');
  await dialog.getByRole('button', { name: 'Noir', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  expect(Math.abs(Number(await playhead.inputValue()) - before)).toBeLessThan(0.04);
  await page.getByRole('tab', { name: 'Captions', exact: true }).click();
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  expect(Math.abs(Number(await playhead.inputValue()) - before)).toBeLessThan(0.04);
  await openTool(dialog, 'Effects');
  await dialog.getByRole('button', { name: 'Add Digital Zoom', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  expect(Math.abs(Number(await playhead.inputValue()) - before)).toBeLessThan(0.04);
  await openTool(dialog, 'Clips');
  await dialog.getByLabel('Clip 1 end', { exact: true }).fill('0.8');
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  const clamped = Number(await playhead.inputValue());
  expect(clamped).toBeGreaterThan(0.7); expect(clamped).toBeLessThan(0.8);
});

test('a different reel template can be previewed and applied after saving and reloading', async ({ page }) => {
  const { dialog } = await openStudio(page);
  const panel = dialog.getByRole('region', { name: 'Auto Edit', exact: true });
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('searchbox', { name: 'Search reel templates' }).fill('Bold Talking Head');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Use Bold Talking Head template', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  const saved = await storedProject(page);
  expect(saved.payload.sheets[0]!.templateId).toBe('scene-boldface');
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('searchbox', { name: 'Search reel templates' }).fill('Quick Tips');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Use Quick Tips template', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByLabel('Auto Edit plan')).toContainText('1 caption styles');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Preview before / after', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Preview version', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  expect((await storedProject(page)).payload.sheets[0]!.templateId).toBe('scene-boldface');
  await page.screenshot({ path: '/tmp/reelstudio-before-after-preview.png' });
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Preview version', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  expect((await storedProject(page)).payload.sheets[0]!.templateId).toBe('scene-karaoke');
});


for (const mobile of [false, true]) {
  test(`modern template search and one-step auto edit ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const { dialog } = await openStudio(page);
    const panel = dialog.getByRole('region', { name: 'Auto Edit', exact: true });
    const gallery = panel.getByRole('region', { name: 'Reel templates', exact: true });
    await expect(gallery.getByRole('button', { name: /^Use .* template$/ })).toHaveCount(6);
    await gallery.getByRole('button', { name: /Show more templates/ }).click();
    await expect(gallery.getByRole('button', { name: /^Use .* template$/ })).toHaveCount(12);
    await gallery.getByRole('group', { name: 'Template categories' }).getByRole('button', { name: 'Business', exact: true }).click();
    await gallery.getByRole('searchbox', { name: 'Search reel templates' }).fill('neon');
    await expect(gallery.getByText('No templates match.', { exact: false })).toBeVisible();
    await gallery.getByRole('group', { name: 'Template categories' }).getByRole('button', { name: 'All', exact: true }).click();
    await gallery.getByRole('searchbox').fill('arcade');
    await gallery.getByRole('button', { name: 'Use Arcade Pop template', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await panel.getByRole('button', { name: 'Auto edit reel', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText('Template: Arcade Pop');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByLabel('Auto Edit plan')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
    const saved = await storedProject(page);
    expect(saved.payload.sheets[0]!.templateId).toBe('scene-arcade');
    expect(saved.payload.creative.autoEdit?.preset).toBe('arcade');
    await page.goto(`/project/${saved.id}?e2e=1`);
    await page.getByRole('tab', { name: 'Creative', exact: true }).click();
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
    await expect(panel.getByRole('status')).toContainText('Template: Arcade Pop');
    expect(errors).toEqual([]);
  });
}

test('full editing pack applies lighting, elements, zooms and measured pause cuts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = { sections: [{ kind: 'main', segments: [{ lines: [{ words: [
    { text: 'Before', start: 0.2, end: 0.8 }, { text: 'After', start: 3.2, end: 3.8 },
  ] }] }] }] };
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  const panel = studio.getByRole('region', { name: 'Auto Edit', exact: true });
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Use Golden Story template', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByLabel('Auto Edit plan')).toContainText('1 pause cuts');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await expect(panel.getByLabel('Auto Edit plan')).toContainText('2 lighting / elements');
  await openTool(page.getByRole('region', { name: 'Creative Studio', exact: true }), 'Auto Edit');
  await panel.getByRole('button', { name: 'Apply auto edit', exact: true }).click();
  await expect(studio.getByTestId('motion-effect')).toHaveCount(3);
  await expect(studio.getByLabel('Effect 3 title', { exact: true })).toHaveValue('Before After');
  await openTool(studio, 'Effects');
  await studio.getByRole('button', { name: 'Preview effect', exact: true }).nth(1).click();
  await studio.getByRole('button', { name: 'Preview', exact: true }).click();
  await studio.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(studio.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  const saved = await storedProject(page);
  expect(saved.payload.creative.effects?.map(effect => effect.kind)).toEqual(['digital-zoom', 'light-leak', 'headline-wall']);
  await page.screenshot({ path: test.info().outputPath('golden-story-pack.png') });
  expect(errors).toEqual([]);
});


test('caption customization stays in Creative and supports undo', async ({ page }) => {
  const { dialog } = await openStudio(page);
  await dialog.getByRole('button', { name: 'Captions', exact: true }).click();
  const controls = dialog.getByRole('region', { name: 'Customize captions' });
  // The inspector is a named section; all changes use the shared editor state.
  await expect(controls.getByRole('heading', { name: 'Customize captions' })).toBeVisible();
  await controls.getByLabel('Caption settings').selectOption('Font & size');
  const size = controls.getByRole('textbox', { name: 'Font size value' });
  const original = await size.inputValue();
  await size.fill('8');
  await size.press('Enter');
  await expect(size).toHaveValue('8.0');
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(size).toHaveValue(original);
  await controls.getByLabel('Caption settings').selectOption('Style & colour');
  await expect(controls.getByRole('heading', { name: 'Style', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
});
