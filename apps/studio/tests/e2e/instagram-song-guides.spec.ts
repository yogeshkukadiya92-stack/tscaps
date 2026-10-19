import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

test('searches actual song metadata and builds a silent montage for Instagram audio', async ({ page }, info) => {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await studio.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Templates', exact: true }).click();
  const gallery = studio.getByRole('region', { name: 'Ready-made reels', exact: true });
  await gallery.getByRole('button', { name: 'Gujarati / Hindi', exact: true }).click();
  await expect(gallery.getByRole('button', { name: /^Watch .* sample$/ })).toHaveCount(6);
  await gallery.getByRole('searchbox').fill('Tochi Raina');
  const card = gallery.getByRole('button', { name: 'Use મેળાની યાદો · Mela Memories template', exact: true });
  await expect(card).toBeVisible();
  await card.click();
  const guide = gallery.getByRole('region', { name: 'Instagram song guide', exact: true });
  await expect(guide.getByText('Do Din Ka Ye Mela - Reprise', { exact: true })).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Open audio on Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/reels/audio/249576719642025/');
  await expect(guide.getByText(/95K reels observed/)).toBeVisible();
  await expect(guide.getByText(/not bundled or copied/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('instagram-song-guide.png'), fullPage: true });
  await guide.getByRole('button', { name: 'Build for Instagram song (no music)', exact: true }).click();
  await expect(studio.getByText(/Mela Memories is ready to preview/)).toBeVisible({ timeout: 30000 });
  await expect(gallery.getByRole('checkbox', { name: 'Include preset instrumental music', exact: true })).not.toBeChecked();
  await studio.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(studio.getByText('Creative edits and media saved with this project.')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('tscaps'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      return await new Promise<{ music: unknown; sourceVolume: number; portrait: boolean; clips: number }>((resolve, reject) => {
        const r = db.transaction('projects').objectStore('projects').getAll();
        r.onsuccess = () => { const c = r.result[0].payload.creative; resolve({ music: c.music, sourceVolume: c.settings.sourceVolume, portrait: c.settings.portrait, clips: c.clips.length }); };
        r.onerror = () => reject(r.error);
      });
    } finally { db.close(); }
  });
  expect(saved.music).toBeNull(); expect(saved.sourceVolume).toBe(0); expect(saved.portrait).toBe(true); expect(saved.clips).toBeGreaterThan(1);
  await gallery.getByRole('searchbox').fill('Mv Studio');
  await gallery.getByRole('button', { name: 'Use મારી મજા · Gujju Portrait template', exact: true }).click();
  await expect(guide.getByText(/Format reference/)).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Open audio on Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/reels/audio/25256576454027145/');
});
