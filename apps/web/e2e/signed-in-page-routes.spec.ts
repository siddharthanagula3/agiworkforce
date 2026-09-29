import { test, expect, type Page } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const SIGNED_IN_PAGES = [
  { route: '/chat/finance', heading: 'Finances' },
  { route: '/code/computer', heading: 'Your computer' },
  { route: '/developers', heading: 'Developer console' },
  { route: '/models/compare', heading: 'Compare answers' },
] as const;

const HEALTH_ROUTE = '/chat/health';
const HEALTH_SPACE_API = '**/api/health-space';

async function expectSignInRedirect(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(route);
}

test.describe('signed-in pages send a signed-out visitor to sign in', () => {
  for (const { route } of SIGNED_IN_PAGES) {
    test(`${route} keeps the destination through sign-in`, async ({ page }) => {
      await expectSignInRedirect(page, route);
    });
  }

  test('/chat/health keeps the destination through sign-in', async ({ page }) => {
    await expectSignInRedirect(page, HEALTH_ROUTE);
  });

  test('/workspace/plugins keeps the destination through sign-in', async ({ page }) => {
    await expectSignInRedirect(page, '/workspace/plugins');
  });

  test('/code/shared keeps the shared session through sign-in', async ({ page }) => {
    await expectSignInRedirect(page, '/code/shared/unknown-shared-session');
  });
});

test.describe('signed-in pages render for the QA account', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(HEALTH_SPACE_API, (route) =>
      route.request().method() === 'GET' ? route.continue() : route.abort(),
    );
    await signIn(page);
  });

  for (const { route, heading } of SIGNED_IN_PAGES) {
    test(`${route} renders its page`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-route-state="not-found"]')).toHaveCount(0);
    });
  }

  test('/chat/health opens the space or says why it cannot', async ({ page }) => {
    await page.goto(HEALTH_ROUTE, { waitUntil: 'domcontentloaded' });

    await expect
      .poll(async () =>
        /\/chat\/projects\//.test(new URL(page.url()).pathname)
          ? 'opened'
          : (await page.getByRole('heading', { level: 1, name: 'Health', exact: true }).count()) > 0
            ? 'landing'
            : 'pending',
      )
      .not.toBe('pending');
  });

  test('/code/computer holds Connect until a pairing link is pasted', async ({ page }) => {
    await page.goto('/code/computer', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Pairing link')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
  });

  test('/chat/finance offers three reporting periods', async ({ page }) => {
    await page.goto('/chat/finance', { waitUntil: 'domcontentloaded' });

    for (const period of ['Last 30 days', 'Last 90 days', 'Last 12 months']) {
      await expect(page.getByRole('button', { name: period })).toHaveAttribute(
        'aria-pressed',
        /^(true|false)$/,
      );
    }
  });

  test('/workspace/plugins answers a non-administrator inside the console frame', async ({
    page,
  }) => {
    await page.goto('/workspace/plugins', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^(Plugins|No workspace selected|You do not administer this workspace|Workspace administration is temporarily unavailable)$/,
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Retire/ })).toHaveCount(0);
  });

  test('/code/shared explains an unknown shared session instead of failing', async ({ page }) => {
    const response = await page.goto('/code/shared/unknown-shared-session', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { level: 1, name: 'AGI Code' })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: /not available|coming soon/ }),
    ).toBeVisible();
  });
});
