import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditor, bootEditorWithCaptions } from './support/editorBoot';

test('builds a photo and video reel with music, undo, persistence and a playable export', async ({ page }) => {
  test.setTimeout(240_000);
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  const gallery = studio.getByRole('region', { name: 'Ready-made reels', exact: true });
  await gallery.getByRole('searchbox').fill('before / after');
  await gallery.getByRole('button', { name: /Before \/ After/ }).click();
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d')!; x.fillStyle = '#e52b2b'; x.fillRect(0, 0, 64, 64); return c.toDataURL('image/png').split(',')[1]!; });
  await gallery.getByLabel('Template photos and videos').setInputFiles([
    { name: 'red-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    { name: 'moment.mp4', mimeType: 'video/mp4', buffer: bytes },
  ]);
  await gallery.getByLabel('Reel template title').fill('Our moments');
  await gallery.getByRole('button', { name: 'Build reel automatically' }).click();
  await expect(studio.getByText(/Before \/ After is ready to preview/)).toBeVisible({ timeout: 60000 });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 60000 });
  const photoPixel = await studio.locator('canvas').evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data));
  expect(photoPixel[0]).toBeGreaterThan(photoPixel[1]! * 2);
  await expect(studio.getByLabel('Reel playhead', { exact: true })).toHaveAttribute('max', '15.999');
  await studio.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(studio.getByLabel('Reel playhead', { exact: true })).not.toHaveAttribute('max', '15.999');
  await studio.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(studio.getByLabel('Reel playhead', { exact: true })).toHaveAttribute('max', '15.999');
  await studio.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(studio.getByText('Creative edits and media saved with this project.')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect(studio.getByLabel('Reel playhead', { exact: true })).toHaveAttribute('max', '15.999');
  await studio.getByText('Render & download', { exact: true }).click();
  await studio.getByLabel('Export format', { exact: true }).selectOption('webm');
  await studio.getByRole('button', { name: 'Render edited reel', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Download reel', exact: true })).toBeVisible({ timeout: 150000 });
  const downloadPromise = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download reel', exact: true }).click();
  const download = await downloadPromise;
  const result = await readFile((await download.path())!);
  expect(result.length).toBeGreaterThan(10000);
  const decoded = await page.evaluate(async data => {
    const blob = new Blob([new Uint8Array(data)], { type: 'video/webm' });
    const url = URL.createObjectURL(blob), video = document.createElement('video'); video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Unplayable export')); });
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(await blob.arrayBuffer()), channel = audio.getChannelData(0);
      let sum = 0; for (const value of channel) sum += value * value;
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, rms: Math.sqrt(sum / channel.length) };
    } finally { URL.revokeObjectURL(url); await context.close(); }
  }, Array.from(result));
  expect(decoded.width).toBe(1080); expect(decoded.height).toBe(1920);
  expect(decoded.duration).toBeCloseTo(16, 0); expect(decoded.rms).toBeGreaterThan(.01);
});


test('starts with only a photo and builds from the current source without transcription', async ({ page }) => {
  await bootEditor(page);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 120; const ctx = c.getContext('2d')!; ctx.fillStyle = '#28b663'; ctx.fillRect(0, 0, 80, 120); return c.toDataURL('image/png').split(',')[1]!; });
  await page.locator('input[type="file"][accept*="image/jpeg"]').first().setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByTestId('no-audio-track-notice')).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Caption language & script', { exact: true }).selectOption('original');
  await page.getByLabel('Language', { exact: true }).fill('English');
  await page.getByRole('option', { name: /^English/ }).first().click();
  await page.getByTestId('start-flow-primary').click();
  await expect(page.getByTestId('start-flow-primary')).toBeHidden({ timeout: 60000 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  const gallery = studio.getByRole('region', { name: 'Ready-made reels', exact: true });
  await expect(gallery.getByText(/No files selected/)).toBeVisible();
  await gallery.getByRole('button', { name: 'Build reel automatically' }).click();
  await expect(studio.getByText(/Travel Postcard is ready to preview/)).toBeVisible({ timeout: 60000 });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 60000 });
  const pixel = await studio.locator('canvas').evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data));
  expect(pixel[1]).toBeGreaterThan(pixel[0]!);
});
