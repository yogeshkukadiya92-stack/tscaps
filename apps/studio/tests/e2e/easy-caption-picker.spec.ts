import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

for (const width of [1440, 375, 320]) test(`simple caption picker applies distinct styles at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await bootEditorWithCaptions(page,
    await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url)),
    JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8')));
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recommended', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.caption-template-grid').first().locator(':scope > div > button:first-child')).toHaveCount(12);
  const classic = page.getByRole('button', { name: 'Classic', exact: true });
  await classic.click();
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'More caption tools' })).toBeHidden();
  await page.locator('.caption-fine-tune > summary').click();
  await page.getByRole('group', { name: 'More caption tools' }).getByRole('button', { name: 'Typography', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Typography', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Style', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search templates', exact: true });
  await search.fill('Smooth');
  await expect(page.getByRole('button', { name: 'Smooth', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Smooth Fusion', exact: true })).toHaveCount(0);
  await search.fill('Estate 3');
  await expect(page.getByText('No templates match.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear style search' }).click();
  await page.getByRole('button', { name: 'All styles', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All styles', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Recommended', exact: true }).click();
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveTitle(/Editor workspace/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if (width < 1024) {
    await expect(page.getByRole('navigation', { name: 'More tools' })).toBeHidden();
    await page.getByRole('button', { name: 'All tools', exact: true }).click();
    await page.getByRole('dialog', { name: 'All tools' }).getByRole('button', { name: 'Auto Edit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Auto Edit', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Style', exact: true }).click();
  }
  if (width === 1440) {
    const save = page.getByRole('button', { name: 'Save project', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(save).toHaveText('Save');
    await page.reload();
    await page.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Style', exact: true }).click();
    await expect(classic).toHaveAttribute('aria-pressed', 'true');
  }
  await page.screenshot({ path: test.info().outputPath(`easy-styles-${width}.png`) });
  expect(errors).toEqual([]);
});
