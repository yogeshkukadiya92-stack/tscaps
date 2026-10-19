import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 650 }, { width: 1512, height: 827 }, { width: 1920, height: 1080 }]) {
  test(`styles, timeline and right preview fit at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
    const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
    await bootEditorWithCaptions(page, bytes, doc);
    const design = page.getByRole('region', { name: 'Design settings', exact: true });
    const preview = page.getByRole('region', { name: 'Video preview', exact: true });
    const timeline = page.getByRole('region', { name: 'Project timeline', exact: true });
    await expect(design.getByRole('tab', { name: 'Choose style', exact: true })).toHaveAttribute('data-state', 'active');
    const regions = await Promise.all([design.boundingBox(), preview.boundingBox(), timeline.boundingBox()]);
    const [d, p, t] = regions;
    expect(p!.x).toBeGreaterThan(d!.x + d!.width);
    expect(t!.y).toBeGreaterThan(d!.y + d!.height);
    expect(t!.y + t!.height).toBeLessThanOrEqual(viewport.height);
    expect(p!.height).toBeGreaterThan(d!.height);
    await design.getByRole('button', { name: 'Lyra', exact: true }).click();
    await expect(design.getByRole('button', { name: 'Lyra', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await design.getByRole('combobox', { name: 'More caption tools' }).selectOption('typography');
    await expect(design.getByRole('combobox', { name: 'More caption tools' })).toHaveValue('typography');
    await design.getByRole('tab', { name: 'Transcript', exact: true }).click();
    await expect(design.getByRole('tab', { name: 'Transcript', exact: true })).toHaveAttribute('data-state', 'active');
    await design.getByRole('tab', { name: 'Choose style', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('reference-editor.png') });
    await timeline.getByRole('button', { name: 'Expand caption timeline', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore Design & captions', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restore Design & captions', exact: true }).click();
    await expect(design).toBeVisible();
    await preview.getByRole('button', { name: 'Minimize Preview' }).click();
    await page.getByRole('button', { name: 'Restore Preview', exact: true }).click();
    await expect(preview).toBeVisible();
  });
}

test('caption workspace follows the dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('region', { name: 'Video preview', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Project timeline', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('dark-editor.png') });
});
