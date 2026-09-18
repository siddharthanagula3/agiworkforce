import { test, expect } from '@playwright/test';

test.use({ colorScheme: 'dark' });

test.describe('/release-notes', () => {
  test('lists dated releases with a maturity state', async ({ page }) => {
    const response = await page.goto('/release-notes');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Releases, newest first.' })).toBeVisible();

    const releases = page.getByRole('list', { name: 'Releases' });
    await expect(releases).toBeVisible();
    await expect(releases.getByText(/^\d{4}-\d{2}-\d{2}$/).first()).toBeVisible();
    await expect(releases.getByText(/^(GA|Beta|Alpha) · /).first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Forthcoming.' })).toBeVisible();
  });

  test('/changelog serves the same ledger', async ({ page }) => {
    const response = await page.goto('/changelog');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('list', { name: 'Releases' })).toBeVisible();
  });
});
