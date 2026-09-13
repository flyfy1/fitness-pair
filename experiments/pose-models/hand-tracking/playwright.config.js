import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 60_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5182', browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:5182', reuseExistingServer: false, timeout: 30_000 },
});
