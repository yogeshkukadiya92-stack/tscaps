import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('auto color grading analyzes real frames, saves and resets correction', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.locator('#workspace-tab-creative').click();
  const studio = page.locator('[data-ui="creative-studio"]');
  await studio.locator('[data-tool="Look"]').click();
  await studio.getByRole('textbox', { name: 'Brightness value', exact: true }).fill('0.8');
  await studio.getByRole('textbox', { name: 'Brightness value', exact: true }).press('Enter');
  await studio.getByRole('button', { name: 'Auto color grading', exact: true }).click();
  await expect(studio.getByText('Auto color grading applied. Preview the result, adjust the sliders and save when ready.', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(studio.locator('[data-ui="creative-preview"]')).toBeEnabled();
  const brightness = studio.getByRole('slider', { name: 'Brightness', exact: true });
  const value = await brightness.inputValue();
  expect(Number(value)).not.toBe(.8);
  await studio.locator('.studio-export > summary').click();
  await studio.locator('[data-ui="creative-render"]').click();
  await expect(studio.locator('[data-ui="creative-download"]')).toBeVisible({ timeout: 45000 });
  await studio.locator('[data-ui="creative-save"]').click();
  await expect(studio.locator('[data-ui="creative-save-status"][data-saved="true"]')).toBeVisible();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('tscaps'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result[0].id); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  await page.goto(`/project/${id}?e2e=1`);
  await page.locator('#workspace-tab-creative').click();
  await studio.locator('[data-tool="Look"]').click();
  await expect(brightness).toHaveValue(value);
  await page.getByTestId('app-language').selectOption('gu');
  await expect(studio.getByRole('button', { name: 'ઓટો કલર ગ્રેડિંગ', exact: true })).toBeVisible();
  await studio.getByRole('button', { name: 'રંગો રીસેટ કરો', exact: true }).click();
  await page.getByTestId('app-language').selectOption('en');
  await expect(brightness).toHaveValue('1');
});
