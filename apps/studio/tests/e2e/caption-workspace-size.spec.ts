import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('caption timeline expands and restores without losing caption content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Project timeline', exact: true });
  await expect(timeline).toBeVisible();
  const before = (await timeline.boundingBox())!;
  const wordsBefore = await page.evaluate(() => window.__tscapsE2E!.documentWords());
  await page.getByRole('button', { name: 'Expand caption timeline', exact: true }).click();
  const restore = page.getByRole('button', { name: 'Restore editor layout', exact: true });
  await expect(restore).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await timeline.boundingBox())!.height).toBeGreaterThan(before.height * 1.8);
  await page.screenshot({ path: test.info().outputPath('expanded-caption-timeline.png') });
  await restore.click();
  await expect(page.getByRole('region', { name: 'Video preview', exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs((await timeline.boundingBox())!.height - before.height)).toBeLessThan(4);
  expect(await page.evaluate(() => window.__tscapsE2E!.documentWords())).toEqual(wordsBefore);
});

test('portrait preview and caption style selection remain discoverable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 1080, height: 1920 });
  await page.getByRole('tab', { name: 'Captions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose caption style' })).toBeVisible();
  const settings = page.getByRole('region', { name: 'Design settings' });
  const classic = settings.getByRole('button', { name: 'Classic', exact: true });
  await expect(classic).toBeInViewport();
  await classic.click();
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('status')).toContainText('Classic');
  const preview = page.getByRole('region', { name: 'Video preview', exact: true });
  expect((await preview.boundingBox())!.height).toBeGreaterThan(450);
  await page.screenshot({ path: test.info().outputPath('caption-style-workspace.png') });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(classic).toBeInViewport();
});
