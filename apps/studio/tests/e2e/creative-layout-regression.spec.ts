import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootEditorWithCaptions } from './support/editorBoot';

for (const viewport of [{ width: 1280, height: 650 }, { width: 1512, height: 827 }, { width: 1920, height: 1080 }]) {
test(`Creative caption gallery keeps monitor and tool headings accessible at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await studio.getByRole('button', { name: 'Captions', exact: true }).click();
  await studio.getByRole('button', { name: 'Lyra', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await expect(studio.locator('.studio-library')).toBeHidden();
  await expect(studio.locator('.studio-timeline-disclosure')).not.toHaveAttribute('open', '');
  const panels = await studio.evaluate(el => {
    const monitor = el.querySelector('.studio-monitor')!.getBoundingClientRect();
    const inspector = el.querySelector('.studio-inspector')!.getBoundingClientRect();
    return { monitorWidth: monitor.width, inspectorWidth: inspector.width, inspectorRight: inspector.right, monitorLeft: monitor.left };
  });
  expect(panels.monitorWidth).toBeGreaterThan(panels.inspectorWidth);
  expect(panels.monitorLeft).toBeGreaterThanOrEqual(panels.inspectorRight);
  await studio.locator('.studio-timeline-disclosure > summary').click();
  await studio.locator('.studio-timeline').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('caption-gallery.png') });
  const layout = await studio.evaluate(el => {
    const bounds = (selector: string) => { const e = el.querySelector(selector)!; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scroll: e.scrollTop, client: e.clientHeight, height: e.scrollHeight }; };
    return { studio: {top: el.getBoundingClientRect().top, scroll: el.scrollTop}, title: bounds('.studio-title'), monitor: bounds('.studio-monitor-heading'), rail: bounds('.studio-tool-rail'), inspector: bounds('.studio-inspector') };
  });
  expect(layout.studio.scroll).toBe(0);
  expect(layout.title.top).toBeGreaterThanOrEqual(layout.studio.top);
  expect(layout.monitor.top).toBeGreaterThanOrEqual(layout.studio.top);
  expect(layout.rail.top).toBeGreaterThanOrEqual(layout.studio.top);
});
}

test('Creative keeps styles and preview usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bytes = await readFile(new URL('./fixtures/sample-with-audio.mp4', import.meta.url));
  const doc = JSON.parse(await readFile(new URL('./fixtures/document.json', import.meta.url), 'utf8'));
  await bootEditorWithCaptions(page, bytes, doc);
  await page.getByRole('tab', { name: 'Creative', exact: true }).click();
  const studio = page.getByRole('region', { name: 'Creative Studio', exact: true });
  await expect(studio.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await expect(studio.locator('.studio-library')).toBeVisible();
  const width = await studio.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.width + 1);
  await studio.getByRole('button', { name: 'Captions', exact: true }).click();
  await expect(studio.locator('.studio-library')).toBeHidden();
  await studio.getByRole('button', { name: 'Auto Edit', exact: true }).click();
  await expect(studio.locator('.studio-library')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-editor.png') });
});
