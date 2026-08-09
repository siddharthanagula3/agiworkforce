/**
 * The signed-out half of signup → checkout, on the real running app.
 *
 * Scope is deliberately the half that needs no credentials. An earlier revision
 * of this file also drove the signed-in half through a Clerk sign-in ticket to
 * compare `/api/checkout` against `/api/me`; those cases never executed once —
 * `Clerk.loaded` never becomes true under Playwright in this tree, exactly as in
 * the untouched `authenticated-flows.spec.ts` — and the contract they encoded
 * was narrower than the route's (it read entitlement as `tier !== 'free' &&
 * active`, while `/api/checkout` additionally requires a linked
 * `stripe_subscription_id`, refuses with 400 before any lookup when
 * `STRIPE_SECRET_KEY` is absent, and renders "Manage billing" rather than
 * "Current plan" for a Team account). They were removed rather than left to
 * time out. Re-adding them needs working ticket sign-in first; the entitlement
 * side is covered against mocks by
 * `app/api/stripe-webhook/lib/__tests__/route.test.ts`.
 *
 * What remains is the purchase gate itself: a paid CTA must take an anonymous
 * visitor to a login page that renders, with the return trip intact, and the
 * checkout API must refuse them outright.
 */
import { test, expect } from '@playwright/test';

test.describe('signup gates the purchase', () => {
  test('a paid CTA sends a signed-out visitor to sign in, and comes back to pricing', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const getPro = page.getByRole('button', { name: 'Get Pro' });
    await expect(getPro).toBeEnabled();

    // /login can answer with a handshake redirect before the real document, so
    // the status that matters is the last one, not the first.
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

    // The CTA must land on the auth gate AND carry the return trip, or the
    // visitor is dumped somewhere with no way back to the purchase.
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
