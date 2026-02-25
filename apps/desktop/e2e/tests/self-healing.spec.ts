import { test, expect } from '../fixtures';

/**
 * Inject a mock authenticated user into localStorage so the app bypasses
 * the AuthPage and renders the main chat interface.  The shape must match
 * the `partialize` output of the `unified-auth-storage` Zustand persist
 * store (version 1, stored at key "unified-auth-storage").
 */
async function injectMockAuth(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const mockAuthState = {
      state: {
        user: {
          id: 'e2e-mock-user-id',
          email: 'e2e@test.local',
          name: 'E2E Test User',
          avatar: null,
        },
        isAuthenticated: true,
        lastSyncedAt: Date.now(),
        creditBalance_cents: 100000,
      },
      version: 1,
    };
    localStorage.setItem('unified-auth-storage', JSON.stringify(mockAuthState));
  });
}

test.describe('Self-Healing Agent', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock auth BEFORE navigation so the app reads it on first load
    await injectMockAuth(page);

    // Mock Supabase auth endpoints so the app does not redirect to login
    await page.route('**/auth/v1/**', (route) => {
      const url = route.request().url();
      if (url.includes('/user') || url.includes('/session')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'e2e-mock-user-id',
            email: 'e2e@test.local',
            role: 'authenticated',
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('retries after initial tool failure and returns a recovery plan', async ({
    page,
    mockLLM,
  }) => {
    const prompt = 'Read /invalid/path/config.json and continue the task';

    mockLLM.setFailOnce(/invalid\/path\/config\.json/i, 500, 'File not found');
    mockLLM.setResponseSequence(/invalid\/path\/config\.json/i, [
      'Initial attempt failed due to a missing file. Starting self-healing recovery.',
      'Recovery complete: I validated fallback paths, regenerated config, and resumed execution.',
    ]);

    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill(prompt);
    await page.getByRole('button', { name: /send/i }).click();

    const errorAlert = page.getByRole('alert').first();
    await expect(errorAlert).toBeVisible({ timeout: 15000 });

    const retryButton = page.getByRole('button', { name: /retry|regenerate|try again/i }).first();
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click();
    } else {
      await chatInput.fill(prompt);
      await page.getByRole('button', { name: /send/i }).click();
    }

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 20000 });
    await expect(assistantMessage).toContainText(
      /self-healing|recovery|fallback|resumed execution/i,
    );
  });
});
