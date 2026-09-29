import { test, expect } from '@playwright/test';

const NOT_FOUND = 404;

test.describe('pages opened from a shared link', () => {
  test('/share/schedules answers an unknown token as unavailable', async ({ page }) => {
    const response = await page.goto('/share/schedules/not-a-schedule-share-token', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(NOT_FOUND);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shared schedule unavailable' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add to my schedules' })).toHaveCount(0);
  });

  test('/slack/link without its code links nothing', async ({ page }) => {
    await page.goto('/slack/link', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Connect Slack to AGI Workforce' }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This link is missing its code.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Slack account' })).toBeDisabled();
  });
});
