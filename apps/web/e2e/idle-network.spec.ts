import { expect, test } from '@playwright/test';
import { parseManagedUsageSummaryResponse } from '@agiworkforce/types';
import { signIn } from './qa-capability-harness';

test('an unattended chat stops optional usage requests and refreshes on interaction', async ({
  page,
}) => {
  await signIn(page);
  let usageRequests = 0;
  await page.route('**/api/usage', async (route) => {
    usageRequests++;
    const now = Date.now();
    await route.fulfill({
      json: parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 85,
        usage_reset_at: new Date(now + 24 * 60 * 60_000).toISOString(),
        has_usage_remaining: true,
        period_start: new Date(now - 24 * 60 * 60_000).toISOString(),
        period_end: new Date(now + 24 * 60 * 60_000).toISOString(),
        subscription_status: 'active',
        session_usage_percentage: 85,
        session_reset_at: new Date(now + 60 * 60_000).toISOString(),
        weekly_usage_percentage: 20,
        weekly_reset_at: new Date(now + 24 * 60 * 60_000).toISOString(),
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
      }),
    });
  });
  await page.clock.install();
  await page.goto('/chat');
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => usageRequests).toBeGreaterThan(0);
  await page.getByRole('textbox').first().click();
  await expect(page.getByTestId('usage-warning-banner')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Shift');
  const initial = usageRequests;
  await page.clock.fastForward(10 * 60_000);
  await expect(page.getByTestId('usage-warning-banner')).toHaveCount(0);
  expect(usageRequests).toBe(initial);
  await page.keyboard.press('Shift');
  await expect.poll(() => usageRequests).toBe(initial + 1);
});
