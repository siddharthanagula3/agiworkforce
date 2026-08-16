import { test, expect } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

test.describe('@smoke v3 composer folder selection', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expectCloudShellReady(page);

    const shell = page.locator('[data-v3-shell]');
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('"Select folder" is reachable from the composer plus menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Add attachment' }).click();

    await expect(page.getByText('Select folder', { exact: true })).toBeVisible();
  });

  test('clicking "Select folder" reaches the folder-selection callback', async ({ page }) => {
    await page.getByRole('button', { name: 'Add attachment' }).click();
    await page.getByText('Select folder', { exact: true }).click();

    await expect(page.getByText('Folder selection requires the desktop app')).toBeVisible();
  });
});
