import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { pluginConfig } from '../server/config.mjs';
import { chromePath, executable, run, exists, npmCli } from './runtime.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const files = ['dist', 'skills', 'scripts', 'server/config.mjs', 'package.json', 'plugin.json', 'mcp.json', 'codex-mcp.json', '.codex-plugin', '.claude-plugin', '.agents', 'README.md', 'START-HERE.html', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'];
try {
  console.log('\nReelStudio Desktop Beta installer\n');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22 or newer: https://nodejs.org');
  if (!await chromePath()) throw new Error('Install Google Chrome: https://www.google.com/chrome/');
  if (!await exists(join(source, 'dist/index.mjs'))) throw new Error('The plugin bundle is missing. Extract the complete beta ZIP first.');
  await npmCli();
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  if (process.argv.includes('--check')) { console.log(`Prerequisites OK. Beta ${pkg.version}; Node ${process.versions.node}; Chrome found. No changes made.`); process.exit(0); }
  let host = process.argv.find(a => a.startsWith('--host='))?.slice(7);
  if (!host && process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { host = (await prompt.question('Install for 1) Codex  2) Claude Code  3) Manual setup [1]: ')).trim() || '1'; } finally { prompt.close(); }
    host = ({ '1': 'codex', '2': 'claude', '3': 'manual' })[host] || host;
  }
  if (!['codex', 'claude', 'manual'].includes(host)) throw new Error('Run with --host=codex, --host=claude, or --host=manual.');
  const target = join(pluginConfig().dataDir, 'plugins', `reelstudio-desktop-${pkg.version}`);
  // Versioned location survives deletion of the downloaded ZIP and preserves older installs.
  if (resolve(source) !== resolve(target)) {
    await mkdir(target, { recursive: true });
    for (const file of files) await cp(join(source, file), join(target, file), { recursive: true });
  }
  // Desktop hosts may not inherit the shell's Node PATH.
  for (const file of ['mcp.json', 'codex-mcp.json', '.claude-plugin/plugin.json']) {
    const path = join(target, file);
    const data = JSON.parse(await readFile(path, 'utf8'));
    data.mcpServers.reelstudio.command = process.execPath;
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  }
  await run(process.execPath, [join(target, 'scripts/setup.mjs')]);
  console.log(`\nInstalled files: ${target}`);
  if (host !== 'manual') {
    const cli = await executable(host);
    if (!cli || /\.(cmd|bat)$/i.test(cli)) {
      // Do not construct a shell command from installation paths on Windows.
      console.log(`\nAutomatic ${host} registration is unavailable. The package is ready; follow START-HERE.html for manual registration.`);
      console.log(`Marketplace folder: ${target}`);
    } else {
      await run(cli, ['plugin', 'marketplace', 'add', target]);
      await run(cli, ['plugin', host === 'codex' ? 'add' : 'install', 'reelstudio-desktop@reelstudio-desktop-beta']);
      console.log(`\nRegistered with ${host}. Restart the app and open a new local chat.`);
    }
  }
  console.log('\nFirst prompt: Use ReelStudio to show templates and open my projects.');
  console.log('Support: yogeshkukadiya92@gmail.com | +91 9825344428');
} catch (error) { console.error(`\nInstallation did not finish: ${error.message}\nSee START-HERE.html or contact support.`); process.exitCode = 1; }
