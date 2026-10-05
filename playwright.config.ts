import { defineConfig } from '@playwright/test';

/**
 * Browser tests against the production build.
 *   npm run e2e      smoke tests (every change)
 *   npm run measure  performance numbers + screenshots of the fixed views
 * Set PW_CHROMIUM_PATH to use an already installed Chromium instead of
 * `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  // In CI the github reporter also turns failures into annotations on the run.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      // Lets headless Chromium fall back to software WebGL when there is no GPU (CI).
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
