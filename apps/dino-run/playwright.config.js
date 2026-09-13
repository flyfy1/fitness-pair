import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5180', channel: 'chrome', viewport: { width: 1440, height: 960 } },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:5180', reuseExistingServer: false },
});
