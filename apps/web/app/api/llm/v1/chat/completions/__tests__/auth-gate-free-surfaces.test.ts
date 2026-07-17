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

describe('runAuthGate free chat surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.getSubscription.mockResolvedValue(subscription('free'));
  });

  it.each(['web', 'mobile', 'desktop'])('admits free chat from %s', async (surface) => {
    const result = await runAuthGate(request(surface));

    expect(result.ok).toBe(true);
  });

  it.each(['chrome', 'vscode', 'api', undefined])(
    'keeps free chat off the %s surface',
    async (surface) => {
      const result = await runAuthGate(request(surface));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toMatchObject({
          error: { code: 'free_trial_surface_unavailable' },
        });
      }
    },
  );

  it('does not apply the free-surface restriction to a paid plan', async () => {
    mocks.getSubscription.mockResolvedValue(subscription('pro'));

    const result = await runAuthGate(request());

    expect(result.ok).toBe(true);
  });

  it('treats an API key as the paid API surface even if it claims to be web', async () => {
    const result = await runAuthGate(request('web', 'sk_live_test-key'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});
