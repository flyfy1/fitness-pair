import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1440, height: 1080 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: process.env.PREVIEW === '1' ? 'npm run preview' : 'npm run dev', url: 'http://127.0.0.1:5178', reuseExistingServer: !process.env.CI, timeout: 90_000 },
});
