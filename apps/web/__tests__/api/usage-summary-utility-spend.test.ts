import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: async () => ({
      credits_allocated_cents: 2_000,
      credits_used_cents: 0,
      credits_remaining_cents: 2_000,
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-10-01T00:00:00.000Z',
    }),
  },
}));

vi.mock('@/lib/services/effective-subscription-service', () => ({
  resolveEffectiveSubscription: async () => ({
    plan_tier: 'pro',
    status: 'active',
    current_period_start: '2026-09-01T00:00:00.000Z',
    current_period_end: '2026-10-01T00:00:00.000Z',
  }),
}));

vi.mock('@/lib/server/spendable-credits', () => ({
  getSpendableCredits: async () => ({ availableCents: 2_000, overageEnabled: false }),
}));

const { getManagedUsageSummary } = await import('@/lib/services/managed-usage-summary-service');

/**
 * The title and memory-extraction spends reach the ledger as ordinary
 * `deduction` rows, which is the row the rolling windows sum. These two cases
 * pin that the summary counts them rather than filtering an auxiliary feature
 * out of the user's own usage picture.
 */
function dbWithDeduction(microusd: number) {
  const seen: string[] = [];
  return {
    seen,
    db: {
      query: vi.fn(async (sql: string) => {
        seen.push(sql);
        if (sql.includes('credit_transactions')) {
          return [{ used_microusd: String(microusd), oldest_at: '2026-09-14T00:00:00.000Z' }];
        }
        return [];
      }),
      execute: vi.fn(async () => 0),
    } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('managed usage summary, metered auxiliary spend', () => {
  it('reports zero session and weekly usage when nothing was deducted', async () => {
    const { db } = dbWithDeduction(0);

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.session_usage_percentage).toBe(0);
    expect(summary.weekly_usage_percentage).toBe(0);
    expect(summary.credits?.five_hour.used).toBe(0);
  });

  it('counts a conversation-title or memory-extraction deduction in the rolling windows', async () => {
    const { db } = dbWithDeduction(500_000);

    const summary = await getManagedUsageSummary(db, 'user-1');

    expect(summary.session_usage_percentage).toBeGreaterThan(0);
    expect(summary.weekly_usage_percentage).toBeGreaterThan(0);
    expect(summary.credits?.five_hour.used).toBeGreaterThan(0);
    expect(summary.credits?.weekly.used).toBeGreaterThan(0);
  });

  it('sums the deduction rows without filtering on the quota feature', async () => {
    const { db, seen } = dbWithDeduction(500_000);

    await getManagedUsageSummary(db, 'user-1');

    const windowQuery = seen.find((sql) => sql.includes('credit_transactions'));
    expect(windowQuery).toBeDefined();
    expect(windowQuery).not.toContain('quotaFeature');
  });
});
