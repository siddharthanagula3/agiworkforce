import { defineConfig, devices } from '@playwright/test';


export default defineConfig({
  testDir: './e2e',
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
    baseURL: 'http://localhost:3000',
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
  ],

  
  webServer: {
    command: 'pnpm tauri dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },

  
  globalTimeout: process.env['CI'] ? 1800000 : 3600000, 

  
  expect: {
    timeout: 5000,
  },
});
