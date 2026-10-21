import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('app language switches without discarding edits and persists after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bytes = await readFile(new URL('./fixtures/auto-edit-pauses.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const select = page.getByTestId('app-language');
  await select.selectOption('gu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'gu');
  const guStudio = page.getByRole('region', { name: 'ક્રિએટિવ સ્ટુડિયો', exact: true });
  await expect(guStudio.getByRole('button', { name: 'ફેરફાર સેવ કરો', exact: true })).toBeVisible();
  await guStudio.getByRole('button', { name: 'ટેમ્પ્લેટ', exact: true }).click();
  const gallery = page.getByTestId('content-formats');
  await gallery.getByLabel('શરૂઆતનું હુક').fill('Home'); // user text must never be translated
  await select.selectOption('hi');
  const hiStudio = page.getByRole('region', { name: 'क्रिएटिव स्टूडियो', exact: true });
  await expect(hiStudio.getByRole('button', { name: 'बदलाव सेव करें', exact: true })).toBeVisible();
  await expect(gallery.getByLabel('शुरुआती हुक')).toHaveValue('Home');
  await page.screenshot({ path: '/tmp/reelstudio-hindi-editor.png' });
  await hiStudio.getByRole('button', { name: 'बदलाव सेव करें', exact: true }).click();
  await expect(hiStudio.getByText('क्रिएटिव संपादन और मीडिया प्रोजेक्ट में सेव हुए।', { exact: true })).toBeVisible();
  await page.reload();
  await expect(select).toHaveValue('hi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await select.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(errors).toEqual([]);
});

test('public pages keep the selected interface language across navigation', async ({ page }) => {
  await page.goto('/');
  const select = page.getByTestId('app-language');
  await select.selectOption('gu');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('તમારો અવાજ.');
  await page.getByRole('navigation', { name: 'મુખ્ય નેવિગેશન' }).getByRole('link', { name: 'કિંમત', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'તમારા માટે યોગ્ય પ્લાન.', exact: false })).toBeVisible();
  await select.selectOption('hi');
  await page.getByRole('link', { name: 'साइन इन', exact: true }).first().click();
  await expect(select).toHaveValue('hi');
  await expect(page.getByLabel('ईमेल', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/reelstudio-hindi-mobile.png' });
});
