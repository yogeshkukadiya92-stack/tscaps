import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('voice enhancement previews, persists and exports audible audio', async ({ page }) => {
  test.setTimeout(120000);
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.locator('#workspace-tab-creative').click();
  const studio = page.locator('[data-ui="creative-studio"]');
  await studio.locator('[data-tool="Timing"]').click();
  await studio.getByRole('textbox', { name: 'End value', exact: true }).fill('2');
  await studio.getByRole('textbox', { name: 'End value', exact: true }).press('Enter');
  await studio.locator('[data-tool="Audio"]').click();
  await studio.getByRole('button', { name: 'Enhance audio', exact: true }).click();
  await expect(studio.getByLabel('Voice enhancement', { exact: true })).toHaveValue('natural');
  await studio.getByLabel('Electric hum removal', { exact: true }).selectOption('50');
  await expect(studio.locator('[data-ui="creative-preview"]')).toBeEnabled();
  await studio.locator('[data-ui="creative-preview"]').click();
  await expect(studio.locator('[data-ui="creative-preview"]')).toHaveAttribute('data-playing', 'true');
  await studio.locator('[data-ui="creative-preview"]').click();
  await studio.locator('[data-ui="creative-save"]').click();
  await expect(studio.locator('[data-ui="creative-save-status"][data-saved="true"]')).toBeVisible();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('tscaps'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result[0].id); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  await page.goto(`/project/${id}?e2e=1`);
  await page.locator('#workspace-tab-creative').click();
  await studio.locator('[data-tool="Audio"]').click();
  await expect(studio.getByLabel('Voice enhancement', { exact: true })).toHaveValue('natural');
  await expect(studio.getByLabel('Electric hum removal', { exact: true })).toHaveValue('50');
  await studio.locator('.studio-export > summary').click();
  await studio.locator('[data-ui="creative-render"]').click();
  await expect(studio.locator('[data-ui="creative-download"]')).toBeVisible({ timeout: 60000 });
  const downloading = page.waitForEvent('download');
  await studio.locator('[data-ui="creative-download"]').click();
  const data = await readFile((await (await downloading).path())!);
  const stats = await page.evaluate(async (base64) => {
    const context = new AudioContext();
    try {
      const encoded = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const decoded = await context.decodeAudioData(encoded.buffer);
      let sum = 0, peak = 0; const samples = decoded.getChannelData(0);
      for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
      return { duration: decoded.duration, rms: Math.sqrt(sum / samples.length), peak };
    } finally { await context.close(); }
  }, data.toString('base64'));
  expect(stats.duration).toBeGreaterThan(1.9); expect(stats.duration).toBeLessThan(2.2);
  expect(stats.rms).toBeGreaterThan(.005); expect(stats.peak).toBeLessThan(1);
  await page.getByTestId('app-language').selectOption('gu');
  await studio.getByRole('button', { name: 'મૂળ અવાજ પાછો લાવો', exact: true }).click();
  await page.getByTestId('app-language').selectOption('en');
  await expect(studio.getByLabel('Voice enhancement', { exact: true })).toHaveValue('off');
  await expect(studio.getByLabel('Electric hum removal', { exact: true })).toHaveValue('off');
});
