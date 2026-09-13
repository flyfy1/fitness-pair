import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 40_000,
  use: { baseURL: 'http://127.0.0.1:5192', channel: 'chrome', viewport: { width: 1440, height: 960 } },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 5192 --strictPort', url: 'http://127.0.0.1:5192', reuseExistingServer: false },
});
