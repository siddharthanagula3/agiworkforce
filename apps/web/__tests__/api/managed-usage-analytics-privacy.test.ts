import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetManagedUsageSummary, mockQuery } = vi.hoisted(() => ({
  mockGetManagedUsageSummary: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
    userId: 'user_usage_privacy',
    organizationId: null,
  })),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: (...args: unknown[]) => mockGetManagedUsageSummary(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET as getBillingAnalytics } from '@/app/api/billing/analytics/route';
import { GET as getUsageAnalytics } from '@/app/api/usage/analytics/route';
import { GET as getUsageHistory } from '@/app/api/usage/history/route';
import { GET as getUsageProviders } from '@/app/api/usage/providers/route';

const publicSummary = {
  plan_tier: 'pro',
  usage_percentage: 25,
  usage_reset_at: '2026-08-01T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-07-01T00:00:00.000Z',
  period_end: '2026-08-01T00:00:00.000Z',
  subscription_status: 'active',
  session_usage_percentage: 50,
  session_reset_at: '2026-07-18T23:00:00.000Z',
  weekly_usage_percentage: 40,
  weekly_reset_at: '2026-07-22T00:00:00.000Z',
  flagship_weekly_usage_percentage: 10,
  flagship_weekly_reset_at: '2026-07-22T00:00:00.000Z',
  credits_used_cents: 500,
  provider_cost_cents: 200,
};

const routes = [
  ['billing analytics', getBillingAnalytics, '/api/billing/analytics?timeRange=30d'],
  ['usage analytics', getUsageAnalytics, '/api/usage/analytics?timeRange=30d'],
  ['usage history', getUsageHistory, '/api/usage/history?limit=50'],
  ['provider usage', getUsageProviders, '/api/usage/providers'],
] as const;

describe('legacy managed-usage report routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetManagedUsageSummary.mockResolvedValue(publicSummary);
    mockQuery.mockResolvedValue([]);
  });

  for (const [label, route, path] of routes) {
    it(`${label} returns the runtime-projected percentage summary only`, async () => {
      const response = await route(new Request(`http://localhost${path}`) as never);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        plan_tier: 'pro',
        usage_percentage: 25,
        usage_reset_at: '2026-08-01T00:00:00.000Z',
        has_usage_remaining: true,
        period_start: '2026-07-01T00:00:00.000Z',
        period_end: '2026-08-01T00:00:00.000Z',
        subscription_status: 'active',
        session_usage_percentage: 50,
        session_reset_at: '2026-07-18T23:00:00.000Z',
        weekly_usage_percentage: 40,
        weekly_reset_at: '2026-07-22T00:00:00.000Z',
        flagship_weekly_usage_percentage: 10,
        flagship_weekly_reset_at: '2026-07-22T00:00:00.000Z',
      });
      expect(mockGetManagedUsageSummary).toHaveBeenCalledWith(
        expect.anything(),
        'user_usage_privacy',
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });
  }
});
