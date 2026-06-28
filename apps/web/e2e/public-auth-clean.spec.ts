/**
 * Public auth surfaces should not emit signed-out API spam.
 *
 * Visiting /login or /signup while signed out must keep the page usable
 * without triggering 401 responses from /api/me.
 */

import { test, expect } from '@playwright/test';

async function assertNoSignedOutMeCalls(
  page: import('@playwright/test').Page,
  route: string,
  titleSelector = '.agi-auth-title',
) {
  const meFailures: string[] = [];

  page.on('response', (response) => {
    if (response.url().endsWith('/api/me') && response.status() === 401) {
      meFailures.push(response.url());
    }
  });

  await page.goto(route);
  await page.waitForLoadState('networkidle');

  await expect(page.locator(titleSelector).first()).toBeVisible();
  expect(meFailures).toEqual([]);
}

test.describe('public auth pages stay quiet', () => {
  test('login page does not call /api/me as a signed-out user', async ({ page }) => {
    await assertNoSignedOutMeCalls(page, '/login');
  });

  test('signup page does not call /api/me as a signed-out user', async ({ page }) => {
    await assertNoSignedOutMeCalls(page, '/signup');
  });
});
