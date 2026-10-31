import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('find tools and open the exact caption or creative control on desktop and phone', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'All tools', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'All tools' });
    await dialog.getByRole('searchbox').fill('nothing-matches');
    await expect(dialog.getByRole('status')).toContainText('No tools found');
    await dialog.getByRole('searchbox').fill('Typography');
    await dialog.getByRole('button', { name: 'Typography', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Typography', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All tools', exact: true }).click();
    await dialog.getByRole('searchbox').fill('music');
    await dialog.getByRole('button', { name: 'Voice & music', exact: true }).click();
    await expect(page.locator('[data-tool="Audio"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Voice & music', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All tools', exact: true }).click();
    await dialog.getByRole('searchbox').fill('');
    await page.screenshot({ path: test.info().outputPath(`tools-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'All tools', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByTestId('app-language').selectOption('gu');
  await page.getByRole('button', { name: 'બધાં ટૂલ્સ', exact: true }).click();
  const localized = page.getByRole('dialog', { name: 'બધાં ટૂલ્સ' });
  await localized.getByRole('searchbox').fill('રંગ');
  await expect(localized.getByRole('button', { name: 'રંગ', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('tools-gujarati.png'), animations: 'disabled' });
});
