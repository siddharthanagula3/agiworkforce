import type { Page, Route } from '@playwright/test';
import type {
  MeResponse,
  SettingsSyncPullResponse,
  SettingsSyncPushResponse,
} from '@agiworkforce/cloud-contracts';

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

/**
 * Return CORS headers that remain valid for credentialed cross-origin fetches.
 * A wildcard origin is forbidden when `credentials: 'include'`; echoing the
 * browser-supplied Origin keeps the fixture faithful to the shipping API.
 */
export function mockCloudCorsHeaders(route: Route): Record<string, string> {
  const requestOrigin = route.request().headers()['origin'];
  return {
    'Access-Control-Allow-Origin': requestOrigin ?? '*',
    ...(requestOrigin
      ? {
          'Access-Control-Allow-Credentials': 'true',
          Vary: 'Origin',
        }
      : {}),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

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
  const displayName = planTier === 'max' ? 'Max' : planTier;
  const meResponse = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: null,
    created_at: null,
    updated_at: Math.floor(Date.now() / 1_000),
    plan: {
      tier: planTier,
      display_name: displayName,
      status: subscriptionStatus,
      current_period_end: null,
    },
    feature_flags: {
      advanced_model_access: planTier === 'max',
      code_execution: true,
    },
    routing_preferences: {},
  } satisfies MeResponse;

  // DES-C14: this was a `'**/api/me'` glob, which Playwright anchors — so the
  // real request (`<WEB_APP_URL>/api/me?surface=desktop`, from
  // `cloudAccountAuth.fetchAccountSnapshot`) never matched and went to the
  // network, logging "[Auth] Failed to refresh Clerk/Neon account data". Match
  // on the pathname so the query string cannot slip past, and answer with CORS
  // headers because that call uses the absolute cloud origin, not same-origin.
  await page.route(
    (url) => url.pathname === '/api/me',
    (route) => {
      const corsHeaders = mockCloudCorsHeaders(route);
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(meResponse),
      });
    },
  );

  await page.route('**/api/settings/sync**', (route) => {
    const method = route.request().method();
    const corsHeaders = mockCloudCorsHeaders(route);
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    if (method === 'POST') {
      const response = { applied: true, cursor: '0' } satisfies SettingsSyncPushResponse;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(response),
      });
    }

    const response = {
      settings: {},
      cursor: '0',
      hasMore: false,
    } satisfies SettingsSyncPullResponse;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(response),
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
