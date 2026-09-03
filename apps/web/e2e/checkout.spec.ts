import { test, expect } from '@playwright/test';

test.describe('signup gates the purchase', () => {
  test('a paid CTA sends a signed-out visitor to sign in, and comes back to pricing', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const getPro = page.getByRole('button', { name: 'Get Pro' });
    await expect(getPro).toBeEnabled();

    await getPro.click();

    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpricing/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.agi-ds-auth-card').first()).toBeVisible();
  });

  test('an anonymous caller cannot create a checkout session', async ({ page }) => {
    const response = await page.request.post('/api/checkout', {
      headers: { 'Content-Type': 'application/json' },
      data: { plan: 'pro', billingInterval: 'monthly' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
    const body = (await response.json()) as { url?: unknown };
    expect(body.url, 'an unauthenticated caller was handed a checkout URL').toBeUndefined();
  });
});
