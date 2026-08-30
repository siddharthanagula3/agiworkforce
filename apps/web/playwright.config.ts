import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

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
      },

  timeout: 120 * 1000,
});
