import type { Page } from '@playwright/test';

export interface MockCloudAuthUser {
  id: string;
  email: string;
  name: string;
}

export interface MockCloudAuthOptions {
  user?: Partial<MockCloudAuthUser>;
  planTier?: string;
  subscriptionStatus?: string;
}

const DEV_BROWSER_SESSION_STORAGE_KEY = '__AGI_DEV_BROWSER_CLOUD_SESSION__';

const DEFAULT_USER: MockCloudAuthUser = {
  id: 'e2e-mock-user-id',
  email: 'e2e@test.local',
  name: 'E2E User',
};

function resolveMockUser(user?: Partial<MockCloudAuthUser>): MockCloudAuthUser {
  return {
    ...DEFAULT_USER,
    ...user,
  };
}

export async function injectMockCloudAuth(
  page: Page,
  options: MockCloudAuthOptions = {},
): Promise<void> {
  const user = resolveMockUser(options.user);
  const planTier = options.planTier ?? 'max';
  const subscriptionStatus = options.subscriptionStatus ?? 'active';

  await page.addInitScript(
    ({ storageKey, seededUser, seededPlanTier, seededSubscriptionStatus }) => {
      const encodeJwtPart = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

      const now = Math.floor(Date.now() / 1000);
      const accessToken = [
        encodeJwtPart({ alg: 'none', typ: 'JWT' }),
        encodeJwtPart({
          sub: seededUser.id,
          email: seededUser.email,
          name: seededUser.name,
          iat: now,
          exp: now + 60 * 60,
        }),
        'e2e',
      ].join('.');

      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: accessToken,
          refresh_token: 'e2e-refresh-token',
        }),
      );

      localStorage.setItem(
        'unified-auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: seededUser.id,
              email: seededUser.email,
              name: seededUser.name,
              avatar: null,
            },
            isAuthenticated: true,
            sessionValidated: true,
            _hasHydrated: true,
            plan: seededPlanTier,
            planDisplayName: seededPlanTier === 'max' ? 'Max' : seededPlanTier,
            subscriptionStatus: seededSubscriptionStatus,
            subscriptionFetchStatus: 'succeeded',
            isPro: true,
            isEnterprise: false,
            featureFlags: {},
            lastSyncedAt: Date.now(),
            creditBalance_cents: 100000,
          },
          version: 1,
        }),
      );
    },
    {
      storageKey: DEV_BROWSER_SESSION_STORAGE_KEY,
      seededUser: user,
      seededPlanTier: planTier,
      seededSubscriptionStatus: subscriptionStatus,
    },
  );
}

export async function mockCloudAccountEndpoints(
  page: Page,
  options: MockCloudAuthOptions = {},
): Promise<void> {
  const user = resolveMockUser(options.user);
  const planTier = options.planTier ?? 'max';
  const subscriptionStatus = options.subscriptionStatus ?? 'active';

  await page.route('**/api/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        plan: { tier: planTier, status: subscriptionStatus },
        feature_flags: {},
      }),
    });
  });
}

export async function dismissOnboarding(page: Page): Promise<void> {
  const skipOnboarding = page
    .getByRole('button', { name: /skip onboarding|skip for now/i })
    .first();

  if (await skipOnboarding.isVisible().catch(() => false)) {
    await skipOnboarding.click();
  }
}
