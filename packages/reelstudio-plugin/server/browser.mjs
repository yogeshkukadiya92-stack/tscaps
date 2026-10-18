import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectUrl } from './config.mjs';

/** Dedicated browser profile; never attaches to or reads the user's ordinary Chrome profile. */
export class ReelBrowser {
  constructor(config, context = null) { this.config = config; this.context = context; this.page = null; this.projectId = null; }
  async browser() {
    if (this.context) return this.context;
    let playwright;
    try {
      const require = createRequire(join(this.config.dataDir, 'package.json'));
      playwright = await import(pathToFileURL(require.resolve('playwright')).href);
    } catch { throw new Error('Run the plugin setup first: node <plugin-folder>/scripts/setup.mjs. Node 22+ and Google Chrome are required.'); }
    await mkdir(this.config.profileDir, { recursive: true, mode: 0o700 });
    try {
      this.context = await playwright.chromium.launchPersistentContext(this.config.profileDir, { channel: this.config.channel, headless: false, acceptDownloads: true });
      this.context.on('close', () => { this.context = null; this.page = null; this.projectId = null; });
    } catch { throw new Error('Could not open the ReelStudio browser. Install Google Chrome, or close another ReelStudio plugin session using this profile and retry.'); }
    return this.context;
  }
  async open(projectId) {
    if (this.projectId && this.projectId !== projectId) throw new Error('This plugin session already has another project open. Finish/save it and start a new plugin session before switching projects.');
    const context = await this.browser();
    if (!this.page || this.page.isClosed()) this.page = context.pages()[0] || await context.newPage();
    const target = projectId ? projectUrl(this.config.origin, projectId) : `${this.config.origin}/projects`;
    // Reusing the current page preserves unsaved manual edits.
    if (this.page.url().replace(/\?.*$/, '') !== target) await this.page.goto(target, { waitUntil: 'domcontentloaded' });
    this.projectId = projectId || null;
    await this.page.bringToFront();
    return { url: target, instructions: 'Sign in yourself in this dedicated browser, then open/import your video and transcribe if needed. Call open_project again with its project ID. Passwords are never requested through chat.' };
  }
  async workspace(projectId) {
    const page = this.page;
    const target = projectUrl(this.config.origin, projectId);
    if (!page || page.isClosed() || page.url().split('?')[0] !== target) throw new Error('Open this project with open_project first, then sign in or restore missing media in the plugin browser.');
    const tab = page.getByRole('tab', { name: 'Creative', exact: true });
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    const workspace = page.getByRole('region', { name: 'Creative Studio', exact: true });
    await workspace.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('[aria-label="Creative Studio"]');
      return root && Array.from(root.querySelectorAll('button')).some(b => ['Preview', 'Stop preview'].includes(b.textContent.trim()) && !b.matches(':disabled'));
    }, null, { timeout: 30000 });
    return workspace;
  }
  async ensureEditable(workspace) {
    if (await workspace.getByRole('button', { name: 'Close comparison', exact: true }).count()) throw new Error('Close the draft Before/After comparison before running plugin edits or export.');
  }
  async autoEdit({ projectId, preset, style, options }, templates) {
    const workspace = await this.workspace(projectId);
    await this.ensureEditable(workspace);
    await workspace.getByRole('navigation', { name: 'Creative tools' }).getByRole('button', { name: 'Auto Edit', exact: true }).click();
    const panel = workspace.getByRole('region', { name: 'Auto Edit', exact: true });
    const advanced = panel.locator('details').filter({ hasText: 'Templates & advanced settings' });
    if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
    if (preset) {
      const recipe = templates.find(t => t.id === preset);
      if (!recipe) throw new Error('Unknown template. Call list_templates first.');
      const gallery = panel.getByRole('region', { name: 'Reel templates', exact: true });
      await gallery.getByRole('group', { name: 'Template categories' }).getByRole('button', { name: 'All', exact: true }).click();
      await gallery.getByRole('searchbox', { name: 'Search reel templates' }).fill(recipe.name);
      await gallery.getByRole('button', { name: `Use ${recipe.name} template`, exact: true }).click();
    } else await panel.getByRole('button', { name: 'Use current caption look', exact: true }).click();
    if (style) await panel.getByRole('group', { name: 'Auto Edit style', exact: true }).getByRole('button', { name: new RegExp(`^${style[0].toUpperCase()}${style.slice(1)}\\b`) }).click();
    const labels = { pauses: 'Trim quiet pauses', zooms: 'Add zoom effects', polish: 'Add lighting, elements and colour polish', captions: 'Style existing captions' };
    for (const [key, label] of Object.entries(labels)) await panel.getByRole('checkbox', { name: label, exact: true }).setChecked(options?.[key] ?? true);
    await panel.getByRole('button', { name: 'Auto edit reel', exact: true }).click();
    await this.page.waitForFunction(() => {
      const root = document.querySelector('[aria-label="Auto Edit"]');
      return root && Array.from(root.querySelectorAll('button')).some(b => b.textContent.trim() === 'Auto edit reel' && !b.matches(':disabled'));
    }, null, { timeout: 600000 });
    const alerts = await panel.getByRole('alert').allTextContents();
    if (alerts.length) throw new Error(alerts.join(' '));
    const statuses = await panel.getByRole('status').allTextContents();
    if (!statuses.some(t => t.includes('auto edit applied.'))) throw new Error('No completed Auto Edit was reported. Inspect the project before retrying.');
    // Persist the same editable project used by the normal UI.
    await workspace.getByRole('button', { name: 'Save creative changes', exact: true }).click();
    await workspace.getByText('Creative edits and media saved with this project.', { exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    return { projectId, previewUrl: projectUrl(this.config.origin, projectId), editable: true, saved: true, summary: statuses };
  }
  async preview(projectId, play) {
    const workspace = await this.workspace(projectId);
    await this.page.bringToFront();
    if (play && await workspace.getByRole('button', { name: 'Preview', exact: true }).count()) {
      await workspace.getByRole('button', { name: 'Preview', exact: true }).click();
      await workspace.getByRole('button', { name: 'Stop preview', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    }
    return { projectId, previewUrl: projectUrl(this.config.origin, projectId), opened: true, playing: !!await workspace.getByRole('button', { name: 'Stop preview', exact: true }).count() };
  }
  async export(projectId, format) {
    const workspace = await this.workspace(projectId);
    await this.ensureEditable(workspace);
    const renderPanel = workspace.locator('details').filter({ hasText: 'Render & download' });
    if (await renderPanel.getAttribute('open') === null) await renderPanel.locator('summary').click();
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(format);
    await workspace.getByRole('button', { name: 'Render edited reel', exact: true }).click();
    // The renderer can fail while preserving a previous editor notice: inspect both outcomes.
    await this.page.waitForFunction(() => {
      const root = document.querySelector('[aria-label="Creative Studio"]');
      return root && (Array.from(root.querySelectorAll('button')).some(b => b.textContent.trim() === 'Download reel') || root.querySelector('[role="alert"]'));
    }, null, { timeout: 1800000 });
    const alerts = await workspace.getByRole('alert').allTextContents();
    if (alerts.length) throw new Error(alerts.join(' '));
    await mkdir(this.config.exportDir, { recursive: true, mode: 0o700 });
    const pending = this.page.waitForEvent('download', { timeout: 30000 });
    await workspace.getByRole('button', { name: 'Download reel', exact: true }).click();
    const download = await pending;
    const safeName = basename(download.suggestedFilename()).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const path = join(this.config.exportDir, `${randomUUID()}-${safeName}`);
    await download.saveAs(path);
    const failure = await download.failure();
    if (failure) throw new Error('The export download failed. Retry export from the plugin browser.');
    return { projectId, format, path, previewUrl: projectUrl(this.config.origin, projectId) };
  }
  async close() { await this.context?.close(); }
}
