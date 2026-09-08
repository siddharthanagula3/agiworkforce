import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

import { loadLocalEnvFile } from './e2e/lib/env-file';

loadLocalEnvFile(path.resolve(__dirname, '.env.local'));

const E2E_RATE_LIMIT_SCALE = '50';
const NO_CREDENTIAL = '';

/**
 * The loader above fills gaps in `process.env` from `.env.local`, real Upstash
 * credentials included, and Playwright starts the server with
 * `{ ...process.env, ...env }`. Left alone the batch shares one live
 * rate-limit bucket with production: it spends the account's real allowance,
 * burns Upstash quota, and 429s its own later specs. Blanking the credentials
 * picks the in-process limiter, and the scale keeps back-to-back sends off the
 * ceiling.
 */
const ISOLATED_SERVER_ENV: Record<string, string> = {
  AGI_RATE_LIMIT_SCALE: E2E_RATE_LIMIT_SCALE,
  UPSTASH_REDIS_REST_URL: NO_CREDENTIAL,
  UPSTASH_REDIS_REST_TOKEN: NO_CREDENTIAL,
  KV_REST_API_URL: NO_CREDENTIAL,
  KV_REST_API_TOKEN: NO_CREDENTIAL,
};

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['RUN_LIVE_MEDIA_E2E'] === '1' ? 0 : process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],

  webServer: process.env['PLAYWRIGHT_REUSE_RUNNING_SERVER']
    ? undefined
    : {
        command: 'pnpm dev',
        url: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
        reuseExistingServer: !process.env['CI'],
        timeout: 120 * 1000,
        env: ISOLATED_SERVER_ENV,
      },

  timeout: 120 * 1000,
});
