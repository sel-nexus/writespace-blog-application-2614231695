/** Run browser journeys against production preview with public local defaults. */
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
const host = env.VITE_PREVIEW_HOST || '127.0.0.1';
const port = Number(env.VITE_PREVIEW_PORT || 4173);
const previewURL = `http://${host}:${port}`;
const baseURL = env.PLAYWRIGHT_BASE_URL || previewURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build '
      + `&& node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
    url: previewURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
