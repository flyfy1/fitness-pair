import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5181', channel: 'chrome', viewport: { width: 1440, height: 960 } },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: false },
});
