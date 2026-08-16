
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

test.describe('authenticated routes stay quiet when signed out', () => {
  test('project detail does not emit 401s as a signed-out user', async ({ page }) => {
    const unauthorized: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 401 && response.url().includes('/api/')) {
        unauthorized.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/chat/projects/empty-id');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole('heading', { name: 'Sign in to AGI' })).toBeVisible();
    expect(unauthorized).toEqual([]);
  });
});
