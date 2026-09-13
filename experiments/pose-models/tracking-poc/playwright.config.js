import { defineConfig } from '@playwright/test';
const port = Number(process.env.TRACKING_PORT ?? 5186);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TRACKING_PORT');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests', timeout: 60_000, workers: 1,
  use: { baseURL, browserName: 'chromium', channel: 'chrome', viewport: { width: 1360, height: 960 } },
  webServer: { command: `npm run preview -- --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 30_000 },
});
