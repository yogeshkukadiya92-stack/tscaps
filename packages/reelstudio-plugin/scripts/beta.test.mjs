import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const archive = join(root, `releases/ReelStudio-Desktop-Beta-${version}.zip`);

test('shared ZIP is self-contained, versioned and contains no private runtime data', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'reelstudio-beta-test-'));
  try {
    execFileSync('unzip', ['-q', archive, '-d', temp]);
    const folder = join(temp, 'ReelStudio-Desktop-Beta');
    const read = file => readFile(join(folder, file), 'utf8');
    const json = async file => JSON.parse(await read(file));
    for (const file of ['package.json', 'plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) assert.equal((await json(file)).version, version, file);
    for (const file of ['dist/index.mjs', 'scripts/install.mjs', 'scripts/runtime.mjs', 'scripts/setup.mjs', 'START-HERE.html', 'Install-Mac.command', 'Install-Windows.cmd', 'install-linux.sh']) await access(join(folder, file));
    assert.equal((await json('.agents/plugins/marketplace.json')).plugins[0].source.path, './');
    assert.equal((await json('.claude-plugin/marketplace.json')).plugins[0].source, './');
    const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n');
    assert.equal(entries.some(name => /(?:^|\/)(?:\.env|browser-profile|exports|node_modules|\.git)(?:\/|$)/.test(name)), false);
    const checksum = createHash('sha256').update(await readFile(archive)).digest('hex');
    assert.ok((await readFile(`${archive}.sha256`, 'utf8')).startsWith(checksum + '  '));
    const client = new Client({ name: 'beta-package-check', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [join(folder, 'dist/index.mjs')], cwd: temp, stderr: 'pipe' });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion().version, version);
      assert.equal((await client.listTools()).tools.length, 6);
      const result = await client.callTool({ name: 'list_templates', arguments: {} });
      assert.equal(JSON.parse(result.content[0].text).templates.length, 31);
    } finally { await client.close(); }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
