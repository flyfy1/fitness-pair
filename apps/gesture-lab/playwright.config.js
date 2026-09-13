import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5183', channel: 'chrome', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 5183 --strictPort', url: 'http://127.0.0.1:5183', reuseExistingServer: false },
});
