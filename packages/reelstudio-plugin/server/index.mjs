import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pluginConfig } from './config.mjs';
import { ReelBrowser } from './browser.mjs';
import { ReelService } from './service.mjs';
import { createServer } from './mcp.mjs';
import templates from './catalog.json' with { type: 'json' };

const config = pluginConfig();
const browser = new ReelBrowser(config);
const server = createServer(new ReelService(browser, templates), config);
const transport = new StdioServerTransport();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
transport.onclose = () => { void close(); };
process.on('SIGINT', () => { void close().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { void close().finally(() => process.exit(0)); });
await server.connect(transport);
