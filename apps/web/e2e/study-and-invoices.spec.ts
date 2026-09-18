import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

test.describe('signed-in pages that ship with their own route', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('/chat/study opens the study surface with its explanation and start control', async ({
    page,
  }) => {
    const response = await page.goto('/chat/study');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Study' })).toBeVisible();
    await expect(page.getByText(/study session is an ordinary conversation/i)).toBeVisible();
    await expect(page.getByRole('button').first()).toBeVisible();
  });

  test('/billing/invoices lists receipts or says why it cannot, never a blank page', async ({
    page,
  }) => {
    const response = await page.goto('/billing/invoices');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Invoices and receipts' })).toBeVisible();
    await expect(page.getByRole('main')).not.toBeEmpty();
  });
});
