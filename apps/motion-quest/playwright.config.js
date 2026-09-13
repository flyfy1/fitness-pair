import { defineConfig } from '@playwright/test';
const port = Number(process.env.MOTION_PORT || 5179);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/browser', timeout: 60_000, workers: 1,
  use: { baseURL, browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1440, height: 1080 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: `${process.env.PREVIEW === '1' ? 'npm run preview' : 'npm run dev'} -- --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 90_000 },
});
