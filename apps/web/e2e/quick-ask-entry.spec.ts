import { expect, test } from '@playwright/test';
import { mockAuthProvider } from './lib/mock-auth-provider';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';

test.describe('Quick Ask entry routes', () => {
  for (const route of ['/quick-ask', `/quick-ask/${SESSION_ID}`]) {
    test(`a signed-out visitor to ${route} is sent to sign-in with the destination intact`, async ({
      page,
    }) => {
      const unauthorizedApis: string[] = [];
      const pageErrors: string[] = [];
      const appConsoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const source = message.location().url;
        if (!source) return;
        try {
          if (new URL(source).origin === new URL(page.url()).origin) {
            appConsoleErrors.push(message.text());
          }
        } catch {
          return;
        }
      });
      page.on('response', (response) => {
        if (response.status() === 401 && new URL(response.url()).pathname.startsWith('/api/')) {
          unauthorizedApis.push(new URL(response.url()).pathname);
        }
      });

      await mockAuthProvider(page);
      await page.goto(route);

      await expect(page).toHaveURL(/\/login(?:\?|$)/u);
      await expect(page.locator('[data-testid="auth-layout"]')).toBeVisible();
      expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(route);
      expect(unauthorizedApis).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(appConsoleErrors).toEqual([]);
      await expect(
        page.getByText(/Unhandled Runtime Error|Application error: a client-side exception/iu),
      ).toHaveCount(0);

      if (route === '/quick-ask') {
        await page.getByRole('textbox', { name: 'Email address' }).fill('qa@example.invalid');
        await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
      }
    });
  }

  test('the phone-sized Quick Ask sign-in remains readable without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/quick-ask');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
