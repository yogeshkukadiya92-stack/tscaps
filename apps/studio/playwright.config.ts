import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env['E2E_PORT'] ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  // Specs suffixed `.close` are excluded from the public build; the
  // default match pattern would skip those files here too.
  testMatch: /.*\.spec(\.close)?\.ts$/,
  outputDir: process.env['E2E_OUTPUT_DIR'] ?? './.playwright-out',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    ...(process.env['E2E_BROWSER_CHANNEL'] ? { channel: process.env['E2E_BROWSER_CHANNEL'] } : {}),
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  ...(process.env['E2E_SKIP_WEBSERVER'] === '1' ? {} : {
    webServer: {
      command: `pnpm preview --port ${port} --strictPort`,
      url: `http://localhost:${port}/`,
      timeout: 60_000,
      reuseExistingServer: !process.env['CI'],
      cwd: __dirname,
    },
  }),
});
