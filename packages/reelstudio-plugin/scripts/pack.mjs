import { mkdtemp, cp, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
await access(join(root, 'dist/index.mjs'));
const releases = join(root, 'releases');
await mkdir(releases, { recursive: true });
for (const platform of ['claude', 'codex']) {
  const temp = await mkdtemp(join(tmpdir(), 'reelstudio-package-'));
  const target = join(temp, 'reelstudio-desktop');
  try {
    await mkdir(target);
    for (const path of ['dist', 'skills', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) await cp(join(root, path), join(target, path), { recursive: true });
    await mkdir(join(target, 'scripts')); await mkdir(join(target, 'server'));
    await cp(join(root, 'scripts/setup.mjs'), join(target, 'scripts/setup.mjs'));
    await cp(join(root, 'server/config.mjs'), join(target, 'server/config.mjs'));
    if (platform === 'claude') await cp(join(root, '.claude-plugin'), join(target, '.claude-plugin'), { recursive: true });
    else for (const path of ['plugin.json', 'mcp.json', '.codex-plugin', 'codex-mcp.json']) await cp(join(root, path), join(target, path), { recursive: true });
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'reelstudio-desktop', version: '0.1.0', private: true, type: 'module', engines: { node: '>=22' } }, null, 2) + '\n');
    const zip = join(releases, `reelstudio-${platform}-0.1.0.zip`);
    await rm(zip, { force: true });
    execFileSync('zip', ['-q', '-r', zip, 'reelstudio-desktop'], { cwd: temp });
    console.log(zip);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
