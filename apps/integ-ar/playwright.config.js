import {defineConfig} from '@playwright/test';
export default defineConfig({testDir: './tests', timeout: 30000, workers: 1,
  use: {baseURL: 'http://127.0.0.1:5285', channel: 'chrome', viewport: {width: 1280, height: 900}},
  webServer: {command: '../../node_modules/.bin/vite preview --host 127.0.0.1 --port 5285 --strictPort', cwd: '.',
    url: 'http://127.0.0.1:5285', reuseExistingServer: false}});
