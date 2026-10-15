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
async function openStudio(page: Page) {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await page.getByRole('button', { name: 'Open Creative Studio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Creative Studio', exact: true });
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  return { dialog, bytes };
}
async function storedProject(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('tscaps'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<{ id: string; payload: { creative: { settings: { text: string }; music: { key: string }; clips: unknown[]; overlays: unknown[] } } }>((resolve, reject) => {
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
  await dialog.getByRole('button', { name: 'Noir', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Text', exact: true }).fill('Saved creative title');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByLabel('Add clips', { exact: true }).setInputFiles({ name: 'extra.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByLabel('Add B-roll', { exact: true }).setInputFiles({ name: 'b-roll.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await dialog.getByLabel('Voice cleanup · rumble filter & noise gate').check();
  await dialog.getByRole('button', { name: 'Save creative changes' }).click();
  await expect(dialog.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/ReelStudio/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const saved = await storedProject(page);
  expect(saved.payload.creative.settings.text).toBe('Saved creative title');
  expect(saved.payload.creative.clips).toHaveLength(2); expect(saved.payload.creative.overlays).toHaveLength(1);
  expect(saved.payload.creative.music.key).toContain('/creative/');
  await page.goto(`/project/${saved.id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await page.getByRole('button', { name: 'Open Creative Studio' }).click();
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(dialog.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue('Saved creative title');
  await expect(dialog.getByText('music.wav', { exact: true })).toBeVisible();
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await expect(dialog.getByLabel('Voice cleanup · rumble filter & noise gate')).toBeChecked();
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Stop preview' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Stop preview' }).click();
  await page.screenshot({ path: '/tmp/reelstudio-creative-desktop.png' });
  expect(errors).toEqual([]);
});

test('unified export includes added clips, portrait FHD, captions and audible music', async ({ page }) => {
  test.setTimeout(180000);
  const { dialog, bytes } = await openStudio(page);
  await dialog.getByLabel('Portrait canvas · 1080 × 1920').check();
  await dialog.getByRole('textbox', { name: 'Text', exact: true }).fill('ONE FINAL EXPORT');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByLabel('Add clips', { exact: true }).setInputFiles({ name: 'extra.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByLabel('Add B-roll', { exact: true }).setInputFiles({ name: 'b-roll.mp4', mimeType: 'video/mp4', buffer: bytes });
  await expect(dialog.getByTestId('creative-overlay')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Picture-in-picture', exact: true }).click();
  await dialog.getByLabel('Clip 1 end', { exact: true }).fill('0.5');
  await dialog.getByLabel('Clip 2 end', { exact: true }).fill('0.5');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).fill('0');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).press('Enter');
  await dialog.getByRole('button', { name: 'Render edited reel' }).click();
  await expect(dialog.getByRole('button', { name: 'Download reel' })).toBeVisible({ timeout: 120000 });
  const downloading = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download reel' }).click();
  const download = await downloading; await download.saveAs('/tmp/reelstudio-unified.mp4'); const output = await readFile((await download.path())!);
  const stats = await decode(page, output);
  expect(stats.width).toBe(1080); expect(stats.height).toBe(1920);
  // This location is black in the letterboxed original; the timed picture-in-picture paints it.
  expect(Math.max(...stats.pixel.slice(0, 3))).toBeGreaterThan(100);
  expect(Math.abs(stats.videoDuration - 1)).toBeLessThan(0.1);
  // AAC encoders may include up to a few priming/padding packets in decoded PCM.
  expect(Math.abs(stats.duration - 1)).toBeLessThan(0.1); expect(stats.rms).toBeGreaterThan(0.01);
  // Main Export must use the same composition, rather than silently exporting the original.
  await page.evaluate(async () => { await window.__tscapsE2E!.triggerExport(); });
  const mainBytes = await page.evaluate(async () => {
    const result = window.__tscapsE2E!.lastResult!;
    if ('error' in result) throw new Error(result.error);
    return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
  });
  const main = await decode(page, Buffer.from(mainBytes));
  expect(main.width).toBe(1080); expect(main.height).toBe(1920); expect(Math.abs(main.videoDuration - 1)).toBeLessThan(0.1); expect(Math.abs(main.duration - 1)).toBeLessThan(0.1);
});

test('mobile split, reorder, undo, cancellation and music-only export', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openStudio(page);
  await dialog.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(dialog.getByTestId('creative-clip')).toHaveCount(2);
  await dialog.getByTestId('creative-clip').nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(dialog.getByLabel('Clip 1 start', { exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(dialog.getByLabel('Clip 1 start', { exact: true })).toHaveValue('0');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
  await dialog.getByRole('textbox', { name: 'Original audio value' }).fill('0');
  await dialog.getByRole('textbox', { name: 'Original audio value' }).press('Enter');
  await dialog.getByRole('textbox', { name: 'Speed value' }).fill('2');
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
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Save creative changes' })).toBeEnabled();
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
  await page.getByRole('button', { name: 'Open Creative Studio' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Missing media: music.wav');
  await dialog.getByLabel('Upload music', { exact: true }).setInputFiles(musicWav());
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('alert')).not.toBeVisible();
  expect((await storedProject(page)).payload.creative.music.key).not.toBe(saved.payload.creative.music.key);
});
