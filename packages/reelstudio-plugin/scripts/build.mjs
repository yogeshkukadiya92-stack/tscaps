import { build } from 'esbuild';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = await build({ entryPoints: [new URL('../../../apps/studio/src/core/creative/ReelPresets.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
const { REEL_PRESETS } = await import(`data:text/javascript;base64,${Buffer.from(catalog.outputFiles[0].text).toString('base64')}`);
await writeFile(`${root}server/catalog.json`, JSON.stringify(REEL_PRESETS, null, 2) + '\n');
await mkdir(`${root}dist`, { recursive: true });
const bundled = await build({ metafile: true, entryPoints: [`${root}server/index.mjs`], outfile: `${root}dist/index.mjs`, bundle: true, platform: 'node', format: 'esm', target: 'node22', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
console.log(`Built ReelStudio MCP plugin with ${REEL_PRESETS.length} recipes.`);

const licenses = new Map();
for (const input of Object.keys(bundled.metafile.inputs).filter(p => p.includes('node_modules/'))) {
  let dir = dirname(input);
  while (dir !== dirname(dir)) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      if (pkg.name) {
        const key = `${pkg.name}@${pkg.version}`;
        if (!licenses.has(key)) {
          let license = '';
          for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'LICENSE-MIT', 'COPYING']) {
            try { license = await readFile(join(dir, name), 'utf8'); break; } catch {}
          }
          if (!license) throw new Error(`No license text found for bundled dependency ${key}`);
          licenses.set(key, `${key} (${pkg.license || 'see license'})\n${license}`);
        }
        break;
      }
    } catch (error) { if (error.message.startsWith('No license text')) throw error; }
    dir = dirname(dir);
  }
}
await writeFile(`${root}THIRD_PARTY_NOTICES.txt`, [...licenses.values()].join('\n\n' + '='.repeat(72) + '\n\n'));
