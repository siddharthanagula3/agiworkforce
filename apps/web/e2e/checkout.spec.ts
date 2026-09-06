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

    // The button does a client-side router.push, not a hard redirect, so
    // there is no document-typed navigation response to assert on, Next
    // fetches the destination as an RSC payload instead. The real evidence
    // that the CTA sent the visitor somewhere real is the URL and the
    // rendered login page itself, same as public-auth-clean.spec.ts checks.
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpricing/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
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
