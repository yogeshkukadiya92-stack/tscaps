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
    const tab = page.locator('#workspace-tab-creative');
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    const workspace = page.locator('[data-ui=creative-studio]');
    await workspace.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-ui=creative-studio]');
      return root && root.querySelector('[data-ui=creative-preview]:not(:disabled)');
    }, null, { timeout: 30000 });
    return workspace;
  }
  async ensureEditable(workspace) {
    if (await workspace.locator('[data-ui=close-comparison]').count()) throw new Error('Close the draft Before/After comparison before running plugin edits or export.');
  }
  async autoEdit({ projectId, preset, style, options }, templates) {
    const workspace = await this.workspace(projectId);
    await this.ensureEditable(workspace);
    await workspace.locator('[data-tool=Auto]').click();
    const panel = workspace.locator('#creative-Auto');
    const advanced = panel.locator('[data-ui=auto-advanced]');
    if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
    if (preset) {
      const recipe = templates.find(t => t.id === preset);
      if (!recipe) throw new Error('Unknown template. Call list_templates first.');
      const gallery = panel.locator('[data-ui=reel-presets]');
      await gallery.locator('[data-category=All]').click();
      await gallery.locator('[data-ui=search-reel-presets]').fill(recipe.name);
      await gallery.locator(`[data-reel-preset=${JSON.stringify(recipe.id)}]`).click();
    } else await panel.locator('[data-ui=current-caption-look]').click();
    if (style) await panel.locator(`[data-auto-style=${JSON.stringify(style)}]`).click();
    for (const key of ['pauses', 'zooms', 'polish', 'captions']) await panel.locator(`[data-auto-option=${key}]`).setChecked(options?.[key] ?? true);
    await panel.locator('[data-ui=auto-apply]').click();
    await this.page.waitForFunction(() => {
      const root = document.querySelector('#creative-Auto');
      return root && root.querySelector('[data-ui=auto-apply]:not(:disabled)');
    }, null, { timeout: 600000 });
    const alerts = await panel.getByRole('alert').allTextContents();
    if (alerts.length) throw new Error(alerts.join(' '));
    const statuses = await panel.getByRole('status').allTextContents();
    if (!await panel.locator('[data-ui=auto-applied]').count()) throw new Error('No completed Auto Edit was reported. Inspect the project before retrying.');
    // Persist the same editable project used by the normal UI.
    await workspace.locator('[data-ui=creative-save]').click();
    await workspace.locator('[data-ui=creative-save-status][data-saved=true]').waitFor({ state: 'visible', timeout: 120000 });
    return { projectId, previewUrl: projectUrl(this.config.origin, projectId), editable: true, saved: true, summary: statuses };
  }
  async preview(projectId, play) {
    const workspace = await this.workspace(projectId);
    await this.page.bringToFront();
    if (play && await workspace.locator('[data-ui=creative-preview][data-playing=false]').count()) {
      await workspace.locator('[data-ui=creative-preview][data-playing=false]').click();
      await workspace.locator('[data-ui=creative-preview][data-playing=true]').waitFor({ state: 'visible', timeout: 30000 });
    }
    return { projectId, previewUrl: projectUrl(this.config.origin, projectId), opened: true, playing: !!await workspace.locator('[data-ui=creative-preview][data-playing=true]').count() };
  }
  async export(projectId, format) {
    const workspace = await this.workspace(projectId);
    await this.ensureEditable(workspace);
    const renderPanel = workspace.locator('.studio-export');
    if (await renderPanel.getAttribute('open') === null) await renderPanel.locator('summary').click();
    await workspace.locator('[data-ui=creative-export-format]').selectOption(format);
    await workspace.locator('[data-ui=creative-render]').click();
    // The renderer can fail while preserving a previous editor notice: inspect both outcomes.
    await this.page.waitForFunction(() => {
      const root = document.querySelector('[data-ui=creative-studio]');
      return root && (root.querySelector('[data-ui=creative-download]') || root.querySelector('[role="alert"]'));
    }, null, { timeout: 1800000 });
    const alerts = await workspace.getByRole('alert').allTextContents();
    if (alerts.length) throw new Error(alerts.join(' '));
    await mkdir(this.config.exportDir, { recursive: true, mode: 0o700 });
    const pending = this.page.waitForEvent('download', { timeout: 30000 });
    await workspace.locator('[data-ui=creative-download]').click();
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
