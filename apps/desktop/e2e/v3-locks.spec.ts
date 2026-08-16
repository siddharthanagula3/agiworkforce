import { test, expect } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

test.describe('@locks v3 shell anti-patterns', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expectCloudShellReady(page);
  });

  test('production v3 shell mounts', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]');
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('no "AGI Workforce" copy is rendered inside the v3 shell', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]').first();
    await expect(shell).toBeAttached();
    await expect(shell.getByText(/AGI Workforce/i)).toHaveCount(0);
  });

  test('ModeSelectionDialog is not in the document', async ({ page }) => {
    // The component was removed in 2026-05; an eslint rule blocks re-imports
    const candidates = page.locator(
      '[data-component="mode-selection-dialog"], [data-testid="mode-selection-dialog"]',
    );
    await expect(candidates).toHaveCount(0);
  });

  test('cap modal stays hidden when no budget cap is active', async ({ page }) => {
    const capModal = page.locator('[data-component="cap-modal"]');
    await expect(capModal).toHaveCount(0);
  });
});
