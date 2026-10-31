import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginConfig, PLAYWRIGHT_VERSION } from '../server/config.mjs';
import { chromePath, npmCli, run, runtimeReady } from './runtime.mjs';
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22 or newer from https://nodejs.org.');
  if (!await chromePath()) throw new Error('Install Google Chrome from https://www.google.com/chrome/ and run setup again.');
  const { dataDir } = pluginConfig();
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  if (!await runtimeReady(dataDir, PLAYWRIGHT_VERSION)) {
    await writeFile(join(dataDir, 'package.json'), JSON.stringify({ name: 'reelstudio-plugin-runtime', private: true, version: '1.0.0' }) + '\n', { mode: 0o600 });
    console.log('Installing the pinned browser runtime. Your normal Chrome profile will not be imported.');
    await run(process.execPath, [await npmCli(), 'install', '--prefix', dataDir, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `playwright@${PLAYWRIGHT_VERSION}`]);
  }
  console.log('Browser runtime ready. Sign in only inside the ReelStudio browser when it opens.');
} catch (error) { console.error(`Setup failed: ${error.message}`); process.exitCode = 1; }
