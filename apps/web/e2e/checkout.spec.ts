import { test, expect } from '@playwright/test';

test.describe('signup gates the purchase', () => {
  test('a paid CTA sends a signed-out visitor to sign in, and comes back to pricing', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const getPro = page.getByRole('button', { name: 'Get Pro' });
    await expect(getPro).toBeEnabled();

    const loginStatuses: number[] = [];
    page.on('response', (response) => {
      if (
        new URL(response.url()).pathname === '/login' &&
        response.request().resourceType() === 'document'
      ) {
        loginStatuses.push(response.status());
      }
    });

    await getPro.click();

    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpricing/);
    await page.waitForLoadState('domcontentloaded');
    expect(
      loginStatuses.at(-1),
      'the paid CTA sent a signed-out visitor to a /login that did not render',
    ).toBe(200);
    await expect(page.locator('.agi-auth-title').first()).toBeVisible();
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
