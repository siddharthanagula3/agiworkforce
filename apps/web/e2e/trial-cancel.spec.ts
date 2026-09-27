import { test, expect } from '@playwright/test';

const TRIAL_CANCEL_ROUTE = '/trial/cancel';
const FORGED_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx.forged';

test.describe('trial cancel link', () => {
  test('a visit with no token shows the expired-link state and offers no cancel button', async ({
    page,
  }) => {
    const response = await page.goto(TRIAL_CANCEL_ROUTE, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: 'This link has expired.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage your plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toHaveCount(0);
  });

  test('a forged token is refused the same way and cancels nothing', async ({ page }) => {
    await page.goto(`${TRIAL_CANCEL_ROUTE}?token=${encodeURIComponent(FORGED_TOKEN)}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: 'This link has expired.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toHaveCount(0);
  });
});
