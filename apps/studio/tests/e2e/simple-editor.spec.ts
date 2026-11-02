import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('one editor exposes every primary tool on desktop and phone, edits captions, saves and exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ['Video', 'Captions', 'Style', 'Music', 'Effects', 'Trim']) {
      const button = page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(studio.locator('canvas')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    if (width < 1024) expect((await page.getByRole('navigation', { name: 'Creative tools' }).boundingBox())!.height).toBeLessThan(100);
    await page.locator('[data-tool="Captions"]').click();
    await expect(page.locator('textarea[data-segment-id]').first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`simple-editor-${width}.png`), animations: 'disabled' });
  }
  const words = page.locator('textarea[data-segment-id]').first();
  await words.fill('Simple captions that I can edit');
  await words.blur();
  await expect.poll(() => page.evaluate(() => window.__tscapsE2E!.documentWords().map(word => word.text).join(' '))).toContain('Simple captions');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Save project', exact: true })).toHaveText('Save');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export video', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'All tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'All tools' }).getByRole('button', { name: 'Change background', exact: true }).click();
  await expect(studio.getByLabel('Background style', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
