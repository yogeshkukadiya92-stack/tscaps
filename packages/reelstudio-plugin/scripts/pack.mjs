import { mkdtemp, cp, writeFile, mkdir, rm, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const releases = join(root, 'releases');
await mkdir(releases, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'reelstudio-package-'));
try {
  const target = join(temp, 'ReelStudio-Desktop-Beta');
  await mkdir(target);
  // Explicit allowlist: no sessions, projects, exports, credentials or development files.
  for (const file of ['dist/index.mjs', 'skills', 'README.md', 'START-HERE.html', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'codex-mcp.json', 'scripts/install.mjs', 'scripts/setup.mjs', 'scripts/runtime.mjs', 'server/config.mjs']) {
    const destination = join(target, file);
    await mkdir(join(destination, '..'), { recursive: true });
    await cp(join(root, file), destination, { recursive: true });
  }
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'reelstudio-desktop', version, private: true, type: 'module', engines: { node: '>=22' } }, null, 2) + '\n');
  await mkdir(join(target, '.agents/plugins'), { recursive: true });
  await writeFile(join(target, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'reelstudio-desktop-beta', interface: { displayName: 'ReelStudio Desktop Beta' }, plugins: [{ name: 'reelstudio-desktop', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Creative Tools' }] }, null, 2));
  await writeFile(join(target, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'reelstudio-desktop-beta', owner: { name: 'ReelStudio' }, plugins: [{ name: 'reelstudio-desktop', source: './', version, description: 'Edit and export ReelStudio reels on your desktop.' }] }, null, 2));
  const shell = '#!/bin/sh\nPATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"\nexport PATH\ncd -- "$(dirname -- "$0")" || exit 1\nif ! command -v node >/dev/null 2>&1; then\n  echo "Install Node.js 22 or newer from https://nodejs.org and try again."\nelse\n  node scripts/install.mjs\nfi\nprintf "\\nPress Enter to close…"\nread -r reply\n';
  for (const name of ['Install-Mac.command', 'install-linux.sh']) { await writeFile(join(target, name), shell); await chmod(join(target, name), 0o755); }
  await writeFile(join(target, 'Install-Windows.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Install Node.js 22 or newer from https://nodejs.org and try again.\r\n) else (\r\n node "%~dp0scripts\\install.mjs"\r\n)\r\npause\r\n');
  const zip = join(releases, `ReelStudio-Desktop-Beta-${version}.zip`);
  await rm(zip, { force: true });
  execFileSync('zip', ['-q', '-r', zip, 'ReelStudio-Desktop-Beta'], { cwd: temp });
  const checksum = createHash('sha256').update(await readFile(zip)).digest('hex');
  await writeFile(`${zip}.sha256`, `${checksum}  ${zip.split('/').pop()}\n`);
  console.log(`Beta package: ${zip}\nSHA-256: ${checksum}`);
} finally { await rm(temp, { recursive: true, force: true }); }
