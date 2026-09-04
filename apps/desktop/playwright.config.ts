import { defineConfig, devices } from '@playwright/test';

const devPort = Number(process.env['PLAYWRIGHT_DEV_PORT']) || 5175;
const managedBaseUrl = `http://127.0.0.1:${devPort}`;
const externalBaseUrl = process.env['PLAYWRIGHT_BASE_URL'];
const baseURL = externalBaseUrl || managedBaseUrl;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
    process.env['CI'] ? ['github'] : ['list'],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'cloud-surfaces',
      testMatch: '**/cloud-surfaces.spec.ts',
    },
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chat',
      testMatch: '**/chat.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'automation',
      testMatch: '**/automation.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'onboarding',
      testMatch: '**/onboarding.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'settings',
      testMatch: '**/settings.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual-regression',
      testMatch: '**/visual-regression.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'accessibility-audit',
      testMatch: '**/accessibility-audit.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'integration',
      testMatch: '**/integration*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'playwright-tests',
      testMatch: '**/playwright*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'gdpr',
      testMatch: '**/gdpr.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'self-healing',
      testMatch: '**/tests/self-healing.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'v3-locks',
      testMatch: '**/v3-*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm run dev:vite',
        url: managedBaseUrl,
        env: {
          VITE_DEV_PORT: String(devPort),
          TAURI_DEV_HOST: '127.0.0.1',
          VITE_DESKTOP_UI_DEV_LOCAL: '0',
        },
        reuseExistingServer: true,
        timeout: 180000,
        stdout: 'pipe',
        stderr: 'pipe',
      },

  globalTimeout: process.env['CI'] ? 1800000 : 3600000,

  expect: {
    timeout: 5000,
  },
});
