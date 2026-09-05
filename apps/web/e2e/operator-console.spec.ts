import { test, expect, type Page } from '@playwright/test';
import { apiCall, signIn } from './qa-capability-harness';

/**
 * The governed side of the operator console.
 *
 * The console's own happy paths are covered at component level, because the
 * platform-operator allowlist (`AGI_PLATFORM_ADMIN_USER_IDS`) is unset in local
 * development and `isPlatformAdmin` denies everyone when it is: no identity
 * reachable from this suite, including the QA account, can render /operator or
 * call one of these routes successfully. What a browser CAN prove here is the
 * half that matters most for a cross-tenant surface, that an authenticated but
 * non-operator account is refused at every entry, and refused with 404 rather
 * than 403 so the surface's existence is not confirmed to it.
 */

const OPERATOR_ROUTE = '/operator';
const TAKEDOWN_ROUTE = '/api/admin/takedown';
const PRIVACY_REQUESTS_ROUTE = '/api/admin/privacy/requests';
const ERASURES_ROUTE = '/api/admin/privacy/erasures';
const ROUTING_HEALTH_ROUTE = '/api/admin/routing-health';
const OBSERVABILITY_ROUTE = '/api/admin/observability';
const OPERATOR_API_ROUTE = '/api/operator?view=costs';

const SAMPLE_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';
const NOT_FOUND = 404;
const SETTLE_MS = 1_500;

/**
 * `setActive` redirects, and a fetch started while that redirect is in flight
 * is aborted as a network error rather than answered. Land on a stable page
 * first so a refusal is a refusal and not a torn-down request.
 */
async function signInAndSettle(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE_MS);
}

test.describe('operator console governance', () => {
  test('a signed-out visitor is sent to sign in and told where they were going', async ({
    page,
  }) => {
    const response = await page.goto(OPERATOR_ROUTE, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toContain('/login');
    expect(decodeURIComponent(page.url())).toContain(OPERATOR_ROUTE);
  });

  test('an authenticated non-operator account never renders the console', async ({ page }) => {
    await signIn(page);
    await page.goto(OPERATOR_ROUTE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Operator dashboard' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'content' })).toHaveCount(0);
  });

  test('every operator read is refused for a non-operator account, as not found', async ({
    page,
  }) => {
    await signInAndSettle(page);

    for (const route of [
      OPERATOR_API_ROUTE,
      ROUTING_HEALTH_ROUTE,
      OBSERVABILITY_ROUTE,
      PRIVACY_REQUESTS_ROUTE,
      `${TAKEDOWN_ROUTE}?token=${SAMPLE_TOKEN}`,
    ]) {
      const result = await apiCall(page, route);
      expect(result.status, `${route} must not answer a non-operator account`).toBe(NOT_FOUND);
      // A missing route would also answer 404, with Next's HTML page. The
      // guard's own JSON refusal is what proves the gate ran.
      expect(result.body, `${route} must be refused by the gate, not merely absent`).toContain(
        '"error"',
      );
    }
  });

  test('the audited takedown and erasure writes are refused for a non-operator account', async ({
    page,
  }) => {
    await signInAndSettle(page);

    const takedown = await apiCall(page, TAKEDOWN_ROUTE, {
      method: 'POST',
      body: { token: SAMPLE_TOKEN, reason: 'e2e gate probe, must be refused' },
    });
    expect(takedown.status, 'takedown must refuse a non-operator account').toBe(NOT_FOUND);
    expect(takedown.body).toContain('"error"');

    const erasure = await apiCall(page, ERASURES_ROUTE, {
      method: 'POST',
      body: { email: 'gate-probe@example.invalid', reason: 'e2e gate probe, must be refused' },
    });
    expect(erasure.status, 'erasure must refuse a non-operator account').toBe(NOT_FOUND);
    expect(erasure.body).toContain('"error"');
  });
});
