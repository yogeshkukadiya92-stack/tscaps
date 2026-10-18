import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('packaged executable supports a real MCP handshake, discovery, validation and error results', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'reelstudio-mcp-isolated-'));
  await cp(fileURLToPath(new URL('../dist/index.mjs', import.meta.url)), join(isolated, 'index.mjs'));
  const client = new Client({ name: 'reelstudio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(isolated, 'index.mjs')], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk; });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['auto_edit', 'export_reel', 'get_job', 'list_templates', 'open_preview', 'open_project']);
    const all = await client.callTool({ name: 'list_templates', arguments: {} });
    assert.equal(JSON.parse(all.content[0].text).templates.length, 31);
    const filtered = await client.callTool({ name: 'list_templates', arguments: { query: 'arcade' } });
    assert.equal(JSON.parse(filtered.content[0].text).templates[0].id, 'arcade');
    const missing = await client.callTool({ name: 'get_job', arguments: { jobId: '4886d0ed-9757-45b6-9c46-05612133cc2e' } });
    assert.equal(missing.isError, true);
    const invalid = await client.callTool({ name: 'open_project', arguments: { projectId: '../signin' } });
    assert.equal(invalid.isError, true);
    const disabled = await client.callTool({ name: 'auto_edit', arguments: { projectId: '4886d0ed-9757-45b6-9c46-05612133cc2e', options: { pauses: false, zooms: false, polish: false, captions: false } } });
    assert.equal(disabled.isError, true);
    assert.equal(stderr.includes('Error'), false, stderr);
  } finally { await client.close(); await rm(isolated, { recursive: true, force: true }); }
});
