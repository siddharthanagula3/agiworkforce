import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mocks.getSubscription(...args),
  },
}));

import { runAuthGate } from '../lib/auth-gate';

function request(surface?: string, token = 'clerk-session-token'): NextRequest {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  };
  if (surface) headers['x-agi-surface'] = surface;

  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers,
  });
}

/**
 * What the credential proves about the caller (D-2026-09-15-09): a browser
 * token is bound to the web app or the extension by the origin Clerk signed,
 * the mobile app's token by its template claim, and a developer token by its
 * own class. The header alone proves nothing.
 */
function credential(surface: string) {
  switch (surface) {
    case 'web':
    case 'desktop':
      return { userId: 'user-1', boundSurface: 'web' };
    case 'chrome':
    case 'mobile':
      return { userId: 'user-1', boundSurface: surface };
    case 'cli':
    case 'vscode':
      return { userId: 'user-1', surfaceClass: 'developer' };
    default:
      return { userId: 'user-1' };
  }
}

function subscription(planTier: string) {
  return {
    id: `sub-${planTier}`,
    user_id: 'user-1',
    plan_tier: planTier,
    status: 'active',
    current_period_start: new Date('2026-07-01T00:00:00Z'),
    current_period_end: new Date('2026-08-01T00:00:00Z'),
    stripe_subscription_id: null,
    stripe_price_id: null,
  };
}

describe('runAuthGate managed cloud surface entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.getSubscription.mockResolvedValue(subscription('free'));
  });

  it.each(['free', 'basic'])('admits %s chat on Web, Mobile, Desktop, and Chrome', async (plan) => {
    mocks.getSubscription.mockResolvedValue(subscription(plan));

    for (const surface of ['web', 'mobile', 'desktop', 'chrome']) {
      mocks.getClerkAuthUser.mockResolvedValue(credential(surface));
      const result = await runAuthGate(request(surface));

      expect(result.ok).toBe(true);
    }
  });

  it.each(['web', 'mobile', 'desktop', 'chrome', 'cli', 'vscode'])(
    'refuses a token bound to no surface even when the header claims %s',
    async (surface) => {
      mocks.getSubscription.mockResolvedValue(subscription('pro'));
      const result = await runAuthGate(request(surface));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toMatchObject({
          error: { code: 'managed_cloud_surface_unknown' },
        });
      }
    },
  );

  it('keeps a web-bound token on the free web capability when the header claims the CLI', async () => {
    mocks.getClerkAuthUser.mockResolvedValue(credential('web'));
    mocks.getSubscription.mockResolvedValue(subscription('free'));

    await expect(runAuthGate(request('cli'))).resolves.toMatchObject({ ok: true });
  });

  it.each(['vscode', 'cli'])('requires Pro for %s', async (surface) => {
    mocks.getClerkAuthUser.mockResolvedValue(credential(surface));
    for (const plan of ['free', 'basic']) {
      mocks.getSubscription.mockResolvedValue(subscription(plan));
      const result = await runAuthGate(request(surface));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toMatchObject({
          error: { code: 'developer_surface_plan_required', requiredTier: 'pro' },
        });
      }
    }

    mocks.getSubscription.mockResolvedValue(subscription('pro'));
    await expect(runAuthGate(request(surface))).resolves.toMatchObject({ ok: true });
  });

  it('requires Pro for managed API access', async () => {
    mocks.getSubscription.mockResolvedValue(subscription('basic'));
    const blocked = await runAuthGate(request(undefined, 'sk_live_test-key'));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      await expect(blocked.response.json()).resolves.toMatchObject({
        error: { code: 'managed_api_plan_required', requiredTier: 'pro' },
      });
    }

    mocks.getSubscription.mockResolvedValue(subscription('pro'));
    await expect(runAuthGate(request(undefined, 'sk_live_test-key'))).resolves.toMatchObject({
      ok: true,
    });
  });

  it('fails closed when any plan omits its client surface', async () => {
    mocks.getSubscription.mockResolvedValue(subscription('enterprise'));
    const result = await runAuthGate(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: 'managed_cloud_surface_unknown' },
      });
    }
  });

  it('treats an API key as the paid API surface even if it claims to be web', async () => {
    mocks.getSubscription.mockResolvedValue(subscription('basic'));
    const result = await runAuthGate(request('web', 'sk_live_test-key'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: 'managed_api_plan_required' },
      });
    }
  });

  it.each(['local-only', 'byok', 'not-a-plan'])(
    'does not cross the %s trust boundary into Managed Cloud chat',
    async (plan) => {
      mocks.getClerkAuthUser.mockResolvedValue(credential('web'));
      mocks.getSubscription.mockResolvedValue(subscription(plan));
      const result = await runAuthGate(request('web'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        await expect(result.response.json()).resolves.toMatchObject({
          error: { code: 'managed_chat_plan_required' },
        });
      }
    },
  );
});
