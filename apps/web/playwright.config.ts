import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real stack: Postgres, core-api, insights and the web app.
 * Locally: start everything (see docs/DEVELOPMENT.md) and run `npm run e2e`.
 * In CI the "e2e" job boots the stack first and points E2E_BASE_URL at `vite preview`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
