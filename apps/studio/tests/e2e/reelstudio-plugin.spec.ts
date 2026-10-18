import { test, expect } from '@playwright/test';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootEditorWithCaptions } from './support/editorBoot';
import { ReelBrowser } from '../../../../packages/reelstudio-plugin/server/browser.mjs';
import { ReelService } from '../../../../packages/reelstudio-plugin/server/service.mjs';
import { pluginConfig } from '../../../../packages/reelstudio-plugin/server/config.mjs';

async function boot(page: import('@playwright/test').Page) {
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc, { width: 128, height: 128 });
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled({ timeout: 30000 });
  const projectId = new URL(page.url()).pathname.split('/').pop()!;
  return projectId;
}

test('plugin applies a real template, saves editable changes, opens preview and downloads a decodable MP4', async ({ page, context }) => {
  const projectId = await boot(page);
  const outputDir = await mkdtemp(join(tmpdir(), 'reelstudio-plugin-test-'));
  const config = pluginConfig({ REELSTUDIO_URL: new URL(page.url()).origin, REELSTUDIO_PLUGIN_DATA: outputDir });
  const browser = new ReelBrowser(config, context);
  browser.page = page; browser.projectId = projectId;
  const catalog = JSON.parse(await readFile(new URL('../../../../packages/reelstudio-plugin/server/catalog.json', import.meta.url), 'utf8'));
  const service = new ReelService(browser, catalog);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    const edit = service.start('auto_edit', projectId, () => browser.autoEdit({ projectId, preset: 'arcade', style: 'energetic' }, catalog));
    await expect.poll(() => service.get(edit.id).status, { timeout: 60000 }).not.toBe('running');
    expect(service.get(edit.id), JSON.stringify(service.get(edit.id))).toMatchObject({ status: 'succeeded', result: { saved: true, editable: true } });
    expect(await browser.preview(projectId, true)).toMatchObject({ opened: true, playing: true });
    await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
    await expect(page.getByLabel('Effect 1 intensity')).toBeEnabled();
    const exported = service.start('export_reel', projectId, () => browser.export(projectId, 'mp4'));
    await expect.poll(() => service.get(exported.id).status, { timeout: 90000 }).not.toBe('running');
    const result = service.get(exported.id);
    expect(result.status, JSON.stringify(result)).toBe('succeeded');
    expect((await stat(result.result.path)).size).toBeGreaterThan(1000);
    const bytes = await readFile(result.result.path);
    const decoded = await page.evaluate(async array => {
      const blob = new Blob([new Uint8Array(array)], { type: 'video/mp4' });
      const video = document.createElement('video'); const url = URL.createObjectURL(blob); video.src = url;
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Invalid video')); });
      const ctx = new AudioContext(); const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const values = audio.getChannelData(0);
      const output = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) };
      await ctx.close(); URL.revokeObjectURL(url); return output;
    }, [...bytes]);
    expect(decoded.width).toBe(128); expect(decoded.duration).toBeGreaterThan(1); expect(decoded.rms).toBeGreaterThan(0.01);
    await page.reload();
    await page.getByRole('tab', { name: 'Creative', exact: true }).click();
    const advanced = page.locator('details').filter({ hasText: 'Templates & advanced settings' });
    if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
    await expect(page.getByRole('region', { name: 'Auto Edit', exact: true }).getByRole('status')).toContainText('Template: Arcade Pop');
    expect(errors).toEqual([]);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('plugin refuses missing project context and an active comparison', async ({ page, context }) => {
  const projectId = await boot(page);
  const browser = new ReelBrowser(pluginConfig({ REELSTUDIO_URL: new URL(page.url()).origin }), context);
  await expect(browser.preview(projectId, false)).rejects.toThrow('open_project first');
  browser.page = page; browser.projectId = projectId;
  const panel = page.getByRole('region', { name: 'Auto Edit', exact: true });
  await panel.getByText('Templates & advanced settings', { exact: true }).click();
  await panel.getByRole('button', { name: 'Analyze auto edit', exact: true }).click();
  await panel.getByRole('button', { name: 'Preview before / after', exact: true }).click();
  await expect(browser.export(projectId, 'mp4')).rejects.toThrow('Close the draft');
  await expect(browser.open('5886d0ed-9757-45b6-9c46-05612133cc2e')).rejects.toThrow('another project');
});
