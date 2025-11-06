import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Tauri desktop app E2E testing.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'tauri-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Configure Tauri app launch
  webServer: {
    command: 'pnpm tauri dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
