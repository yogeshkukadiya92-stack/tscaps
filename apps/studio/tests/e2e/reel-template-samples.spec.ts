import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

async function openSamples(page: import('@playwright/test').Page) {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  return { studio, gallery: studio.getByRole('region', { name: 'Ready-made reels', exact: true }) };
}

test('loads samples on demand, plays music in a dialog and keeps the project unchanged', async ({ page }, info) => {
  const requests: string[] = [];
  page.on('request', request => { if (/reel-previews\/.*\.mp4/.test(request.url())) requests.push(request.url()); });
  const { studio, gallery } = await openSamples(page);
  await expect(gallery.getByRole('button', { name: /^Watch .* sample$/ })).toHaveCount(6);
  expect(requests).toHaveLength(0);
  const initialDuration = await studio.getByLabel('Reel playhead', { exact: true }).getAttribute('max');
  const card = gallery.getByRole('button', { name: 'Use Travel Postcard template', exact: true });
  await card.hover({ timeout: 10000 });
  await expect.poll(() => card.locator('video').evaluate(v => !v.paused && v.currentTime > .1)).toBe(true);
  expect(requests.some(url => url.includes('travel-postcard.mp4'))).toBe(true);
  await expect(card.locator('video')).toHaveJSProperty('muted', true);
  await gallery.getByRole('button', { name: 'Watch Weekend Escape sample', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Weekend Escape sample', exact: true });
  await expect(dialog).toBeVisible();
  const movie = dialog.getByLabel('Weekend Escape sample video', { exact: true });
  await expect.poll(() => movie.evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth)).toBe(360);
  await expect(movie).toHaveJSProperty('muted', false);
  expect(await movie.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(8, 1);
  await page.screenshot({ path: info.outputPath('sample-with-music.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.getByLabel('Reel playhead', { exact: true })).toHaveAttribute('max', initialDuration!);
  await gallery.getByRole('button', { name: 'Watch Weekend Escape sample', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use this template', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(gallery.getByRole('button', { name: 'Use Weekend Escape template', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.getByLabel('Reel playhead', { exact: true })).toHaveAttribute('max', initialDuration!);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath('gallery.png'), fullPage: true });
});

test('respects reduced motion and supports touch-sized sample playback', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { gallery } = await openSamples(page);
  const card = gallery.getByRole('button', { name: 'Use Travel Postcard template', exact: true });
  await card.hover({ timeout: 10000 });
  await expect(card.locator('video')).not.toHaveAttribute('src');
  await gallery.getByRole('searchbox').fill('Editorial Noir');
  await gallery.getByRole('button', { name: 'Watch Editorial Noir sample', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editorial Noir sample', exact: true });
  await expect(dialog).toBeVisible();
  const video = dialog.locator('video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
  expect(await dialog.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Close sample', exact: true }).click();
  await expect(dialog).toBeHidden();
});
