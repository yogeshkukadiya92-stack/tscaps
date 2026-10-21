import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('content format drafts, selection and effects survive project save and reopen', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  const gallery = page.getByTestId('content-formats');
  await expect(gallery).toBeVisible();
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await studio.locator('canvas').first().evaluate(canvas => { canvas.dataset.draftPreview = 'kept'; });
  await gallery.getByTestId('content-language').selectOption('gu');
  await gallery.getByLabel('Opening hook').fill('તમારી વાર્તા અહીંથી શરૂ થાય છે');
  await gallery.getByTestId('content-language').selectOption('hi');
  await expect(gallery.getByLabel('Opening hook')).toHaveValue(/आइए बात करें/);
  await gallery.getByTestId('content-language').selectOption('en');
  await expect(gallery.getByLabel('Opening hook')).toHaveValue(/Let’s talk/);
  await gallery.getByTestId('content-language').selectOption('gu');
  await expect(gallery.getByLabel('Opening hook')).toHaveValue('તમારી વાર્તા અહીંથી શરૂ થાય છે');
  await expect(studio.locator('canvas').first()).toHaveAttribute('data-draft-preview', 'kept');
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  const timings = gallery.getByRole('spinbutton');
  for (let i = 0; i < await timings.count(); i++) await timings.nth(i).fill('1');
  await gallery.getByRole('button', { name: 'Apply to reel', exact: true }).click();
  await expect(gallery.getByRole('status')).toContainText('Format applied');
  await studio.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(studio.getByText('Creative edits and media saved with this project.', { exact: true })).toBeVisible();
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('tscaps'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result[0].id); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  await page.goto(`/project/${id}?e2e=1`);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(gallery.getByTestId('content-language')).toHaveValue('gu');
  await expect(gallery.getByLabel('Opening hook')).toHaveValue('તમારી વાર્તા અહીંથી શરૂ થાય છે');
  await expect(gallery.getByRole('spinbutton').first()).toHaveValue('1');
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Effects', exact: true }).click();
  await expect(studio.getByLabel('Effect 1 title', { exact: true })).toHaveValue('તમારી વાર્તા અહીંથી શરૂ થાય છે');
});
