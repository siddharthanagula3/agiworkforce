import { test, expect } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const ADMIN_REFUNDS_ROUTE = '/admin/refunds';
const CONSOLE_HEADING = 'Refunds and disputes';

test.describe('admin refunds console governance', () => {
  test('a signed-out visitor never renders the refunds console', async ({ page }) => {
    await page.goto(ADMIN_REFUNDS_ROUTE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: CONSOLE_HEADING })).toHaveCount(0);
  });

  test('an authenticated non-operator account is answered as not found', async ({ page }) => {
    await signIn(page);
    const response = await page.goto(ADMIN_REFUNDS_ROUTE, { waitUntil: 'domcontentloaded' });

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: CONSOLE_HEADING })).toHaveCount(0);
  });
});
