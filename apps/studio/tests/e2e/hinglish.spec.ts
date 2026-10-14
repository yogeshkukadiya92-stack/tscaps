import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditor, bootEditorWithCaptions, setVideoBytes } from './support/editorBoot';

test('Roman Hinglish defaults, accuracy selection persists, and other languages stay available', async ({ page }) => {
  await bootEditor(page);
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  await setVideoBytes(page, bytes);
  const dialog = page.getByRole('dialog', { name: 'Start your video' });
  await expect(dialog.getByLabel('Caption language & script', { exact: true })).toHaveValue('roman-hinglish');
  await expect(dialog.getByRole('button', { name: 'Balanced · Small', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Accuracy · Medium', exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tscaps:transcribe-preference')!));
  expect(stored.model).toBe('medium'); expect(stored.captionStyle).toBe('roman-hinglish');
  await dialog.screenshot({ path: test.info().outputPath('hinglish-default.png') });
  await dialog.getByLabel('Caption language & script', { exact: true }).selectOption('original');
  await expect(dialog.getByRole('textbox', { name: 'Language', exact: true })).toBeVisible();
});

test('existing Hindi captions convert to Roman Hinglish and Undo restores the script', async ({ page }) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const document = { language: 'hi', sections: [{ kind: 'main', segments: [{ lines: [{ words: [
    { text: 'आज', start: 0, end: 0.4 }, { text: 'हम', start: 0.4, end: 0.8 },
    { text: 'video', start: 0.8, end: 1.2 }, { text: 'करेंगे', start: 1.2, end: 1.8 },
  ] }] }] }] };
  await bootEditorWithCaptions(page, bytes, document);
  await page.getByRole('tab', { name: 'Transcript', exact: true }).click();
  const before = await page.evaluate(() => window.__tscapsE2E!.documentWords());
  await page.getByRole('button', { name: 'Convert Hindi to Roman Hinglish' }).click();
  const textarea = page.locator('textarea[data-segment-id]').first();
  await expect(textarea).toHaveValue(/^aaj hum video/);
  const after = await page.evaluate(() => window.__tscapsE2E!.documentWords());
  expect(after.map(word => word.text)).toEqual(['aaj', 'hum', 'video', 'karenge']);
  expect(after.map(({ id, start, end }) => ({ id, start, end }))).toEqual(before.map(({ id, start, end }) => ({ id, start, end })));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(textarea).toHaveValue('आज हम video करेंगे');
  expect(await page.evaluate(() => window.__tscapsE2E!.documentWords())).toEqual(before);
});
