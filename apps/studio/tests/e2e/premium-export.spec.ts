import { test, expect } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bootEditorWithCaptions } from './support/editorBoot';

// Opt-in: encode and retain one real MP4 per premium preset for release QC.
const enabled = process.env['PREMIUM_EXPORT_QC'] === '1';
const templatesRoot = resolve('../../templates');
const output = process.env['PREMIUM_EXPORT_QC_DIR'] ?? '/tmp/reelstudio-premium-export-qc';
const ids = (await readdir(templatesRoot)).filter(id => id.startsWith('premium-')).sort();
test.beforeAll(async () => {
  if (!enabled) return;
  await mkdir(output, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
    'color=c=0x162337:s=720x1280:r=24:d=4', '-f', 'lavfi', '-i',
    'sine=frequency=440:sample_rate=48000:duration=4', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', resolve(output, 'source.mp4')]);
});

// Decode every output frame. Catch valid MP4 containers with invisible captions,
// lost audio or clipped animated words (Estate's overshoot previously hit edges).
function checkEncodedVideo(path: string, hidden: boolean) {
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams',
    '-show_format', '-of', 'json', path], { encoding: 'utf8' })) as {
      streams: Array<{ codec_type: string; width?: number; height?: number }>;
      format: { duration: string };
    };
  expect(metadata.streams.find(stream => stream.codec_type === 'video')).toMatchObject({ width: 720, height: 1280 });
  expect(metadata.streams.some(stream => stream.codec_type === 'audio')).toBe(true);
  expect(Number(metadata.format.duration)).toBeCloseTo(4, 1);
  const frames = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', 'scale=360:640',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 80 * 1024 * 1024 });
  const stride = 360 * 640 * 3;
  expect(frames.length / stride).toBe(96);
  let edges = 0;
  const visible = [0, 0, 0];
  for (let offset = 0, frame = 0; offset < frames.length; offset += stride, frame++) {
    const bg = [frames[offset]!, frames[offset + 1]!, frames[offset + 2]!];
    for (let pixel = 0; pixel < stride; pixel += 3) {
      if (Math.max(Math.abs(frames[offset + pixel]! - bg[0]!), Math.abs(frames[offset + pixel + 1]! - bg[1]!), Math.abs(frames[offset + pixel + 2]! - bg[2]!)) <= 35) continue;
      const x = (pixel / 3) % 360;
      const y = Math.floor(pixel / 3 / 360);
      if (x < 3 || x >= 357 || y < 3 || y >= 637) edges++;
      visible[Math.min(2, Math.floor(frame / 32))]!++;
    }
  }
  expect(edges, 'caption pixels at the video boundary').toBe(0);
  for (const pixels of visible) {
    if (hidden) expect(pixels).toBe(0);
    else expect(pixels, 'English, Hindi and Gujarati must each burn into the video').toBeGreaterThan(10);
  }
}

const words = ['Make', 'every', 'video', 'amazing', 'आज', 'नया', 'वीडियो', 'बनाएंगे', 'તમારા', 'કૅપ્શન', 'સરસ', 'દેખાશે'];
const document = { sections: [{ kind: 'main', segments: [{ lines: [{ words: words.map((text, i) => ({
  text, start: i / 3, end: (i + 1) / 3,
})) }] }] }] };

for (const id of ids) {
  const config = JSON.parse(await readFile(resolve(templatesRoot, id, 'template.json'), 'utf8')) as { name: string };
  test(`premium export: ${config.name}`, async ({ page }) => {
    test.skip(!enabled, 'Set PREMIUM_EXPORT_QC=1 for the full video export battery.');
    test.setTimeout(150_000);
    await mkdir(output, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const video = await readFile(resolve(output, 'source.mp4'));
    await bootEditorWithCaptions(page, video, document, { width: 720, height: 1280 });
    await page.getByRole('tab', { name: 'Templates', exact: true }).click();
    await page.getByPlaceholder('Search templates').fill(config.name);
    const card = page.getByRole('button', { name: config.name, exact: true }).first();
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__tscapsE2E!.seekPreview(0.95));
    await page.screenshot({ path: resolve(output, `${id}-preview.png`) });
    await page.evaluate(() => { window.__tscapsE2E!.lastResult = undefined; void window.__tscapsE2E!.triggerExport(); });
    await page.waitForFunction(() => window.__tscapsE2E?.lastResult !== undefined, null, { timeout: 120_000 });
    const result = await page.evaluate(async () => {
      const result = window.__tscapsE2E!.lastResult!;
      if ('error' in result) return { error: result.error };
      return { bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())), mime: result.mimeType };
    });
    if ('error' in result) throw new Error(result.error);
    expect(result.bytes.length).toBeGreaterThan(1024);
    await writeFile(resolve(output, `${id}.mp4`), Buffer.from(result.bytes));
    checkEncodedVideo(resolve(output, `${id}.mp4`), id === 'premium-no-caption');
    expect(errors).toEqual([]);
  });
}
