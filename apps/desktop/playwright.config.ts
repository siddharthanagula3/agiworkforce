import { defineConfig, devices } from '@playwright/test';

const defaultBaseUrl = 'http://127.0.0.1:5175';
const baseURL = process.env['PLAYWRIGHT_BASE_URL'] || defaultBaseUrl;

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
      name: 'agi',
      testMatch: '**/agi.spec.ts',
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
      name: 'agi-safety',
      testMatch: '**/agi-safety.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'self-healing',
      testMatch: '**/tests/self-healing.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // In CI, we start the dev server manually in the workflow
  // This allows faster startup and better control over the process
  webServer: process.env['CI'] ? undefined : undefined,

  globalTimeout: process.env['CI'] ? 1800000 : 3600000,

  expect: {
    timeout: 5000,
  },
});
