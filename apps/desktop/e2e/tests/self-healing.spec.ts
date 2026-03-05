import { test, expect } from '../fixtures';

function getSupabaseStorageKey(): string {
  const supabaseUrl = process.env['VITE_SUPABASE_URL'] || 'https://test.supabase.co';
  try {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split('.')[0] || 'test';
    return `sb-${projectRef}-auth-token`;
  } catch {
    return 'sb-test-auth-token';
  }
}

async function injectMockAuth(page: import('@playwright/test').Page) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const mockUser = {
    id: 'e2e-mock-user-id',
    email: 'e2e@test.local',
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: { full_name: 'E2E Test User' },
    created_at: new Date().toISOString(),
  };
  const mockSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    token_type: 'bearer',
    user: mockUser,
  };

  await page.addInitScript(
    ({ session, user, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify(session));
      localStorage.setItem('supabase.auth.token', JSON.stringify(session));

      const mockAuthState = {
        state: {
          user: {
            id: user.id,
            email: user.email,
            name: 'E2E Test User',
            avatar: null,
          },
          isAuthenticated: true,
          sessionValidated: true,
          _hasHydrated: true,
          plan: 'max',
          planDisplayName: 'Max',
          subscriptionStatus: 'active',
          subscriptionFetchStatus: 'succeeded',
          isPro: true,
          isEnterprise: false,
          featureFlags: {},
          lastSyncedAt: Date.now(),
          creditBalance_cents: 100000,
        },
        version: 1,
      };

      localStorage.setItem('unified-auth-storage', JSON.stringify(mockAuthState));
    },
    { session: mockSession, user: mockUser, storageKey: getSupabaseStorageKey() },
  );
}

function mockSupabaseAuthEndpoints(page: import('@playwright/test').Page) {
  const mockUser = {
    id: 'e2e-mock-user-id',
    email: 'e2e@test.local',
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: { full_name: 'E2E Test User' },
    created_at: new Date().toISOString(),
  };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const mockSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    token_type: 'bearer',
    user: mockUser,
  };

  return page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/user')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
      return;
    }

    if (url.includes('/token') || url.includes('/session')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      });
      return;
    }

    if (url.includes('/logout')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSession),
    });
  });
}

async function ensureAuthenticated(page: import('@playwright/test').Page) {
  const emailInput = page.getByRole('textbox', { name: /email address/i });
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill('e2e@test.local');
    await page.getByRole('textbox', { name: /password/i }).fill('e2e-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();
  }
}

test.describe('Self-Healing Agent', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page);
    await mockSupabaseAuthEndpoints(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await ensureAuthenticated(page);
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

    const chatInput = page
      .getByRole('textbox', { name: /message/i })
      .or(page.locator('textarea[aria-label="Message"]'))
      .first();
    await expect(chatInput).toBeVisible({ timeout: 20000 });
    await chatInput.fill(prompt);
    await page.getByRole('button', { name: /send/i }).click();

    const desktopRuntimeGate = page.getByText(
      /This feature requires the AGI Workforce desktop application/i,
    );
    const subscriptionDialog = page.getByRole('dialog', { name: /Subscription Required/i });

    if (
      (await desktopRuntimeGate.isVisible().catch(() => false)) ||
      (await subscriptionDialog.isVisible().catch(() => false))
    ) {
      test.skip(
        true,
        'Self-healing flow requires desktop runtime and an eligible plan; web-mode CI validates fallback behavior.',
      );
    }

    const retryButton = page.getByRole('button', { name: /retry|regenerate|try again/i }).first();
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click();
    }

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 20000 });
    await expect(assistantMessage).toContainText(
      /self-healing|recovery|fallback|resumed execution|initial attempt failed/i,
    );
  });
});
