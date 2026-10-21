import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('person background color and photo render, export and survive reopening', async ({ page }) => {
  test.setTimeout(180000);
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.locator('#workspace-tab-creative').click();
  const studio = page.locator('[data-ui="creative-studio"]');
  await studio.locator('[data-tool="Timing"]').click();
  await studio.getByRole('textbox', { name: 'End value', exact: true }).fill('1');
  await studio.getByRole('textbox', { name: 'End value', exact: true }).press('Enter');
  await studio.locator('[data-tool="Background"]').click();
  await studio.getByLabel('Background style', { exact: true }).selectOption('color');
  await studio.getByLabel('Background color', { exact: true }).fill('#ff0000');
  await expect(studio.locator('[data-ui="creative-preview"]')).toBeEnabled({ timeout: 90000 });
  const pixel = () => studio.locator('canvas').first().evaluate(canvas => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(2, 2, 1, 1).data));
  await expect.poll(pixel).toEqual([255, 0, 0, 255]);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d')!; ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 32, 32); return c.toDataURL().split(',')[1]!; });
  await studio.getByLabel('Upload background photo', { exact: true }).setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(studio.getByLabel('Background style', { exact: true })).toHaveValue('image');
  await expect(studio.locator('[data-ui="creative-preview"]')).toBeEnabled({ timeout: 90000 });
  await expect.poll(pixel).toEqual([0, 255, 0, 255]);
  await studio.locator('[data-ui="creative-save"]').click();
  await expect(studio.locator('[data-ui="creative-save-status"][data-saved="true"]')).toBeVisible();
  await studio.locator('.studio-export > summary').click();
  await studio.locator('[data-ui="creative-render"]').click();
  await expect(studio.locator('[data-ui="creative-download"]')).toBeVisible({ timeout: 90000 });
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('tscaps'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result[0].id); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  await page.goto(`/project/${id}?e2e=1`);
  await page.locator('#workspace-tab-creative').click();
  await studio.locator('[data-tool="Background"]').click();
  await expect(studio.getByLabel('Background style', { exact: true })).toHaveValue('image');
  await expect(studio.locator('[data-ui="creative-preview"]')).toBeEnabled({ timeout: 90000 });
  await expect.poll(pixel).toEqual([0, 255, 0, 255]);
  await page.getByTestId('app-language').selectOption('gu');
  await studio.getByRole('button', { name: 'મૂળ બેકગ્રાઉન્ડ પાછું લાવો', exact: true }).click();
  await page.getByTestId('app-language').selectOption('en');
  await expect(studio.getByLabel('Background style', { exact: true })).toHaveValue('original');
});
