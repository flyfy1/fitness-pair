import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 60_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5186', browserName: 'chromium', channel: 'chrome', viewport: { width: 1360, height: 960 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5186', reuseExistingServer: false, timeout: 90_000 },
});
