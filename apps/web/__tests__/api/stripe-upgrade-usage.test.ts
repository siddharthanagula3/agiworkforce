import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: dbMocks.query }),
}));

import { CreditService } from '@/lib/services/credit-service';

describe('paid-plan upgrade usage carry-forward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.query.mockResolvedValue([{ account_id: 'credit-account-1' }]);
  });

  it('adds the upgrade delta once even when the renewal period is unchanged', async () => {
    const periodStart = new Date('2026-07-18T18:00:00.000Z');
    const periodEnd = new Date('2026-08-18T18:00:00.000Z');

    const accountId = await CreditService.carryUsageIntoUpgradedPeriod(
      'user-123',
      'subscription-123',
      periodStart,
      periodEnd,
      4_000,
      dbMocks as never,
    );

    expect(accountId).toBe('credit-account-1');
    expect(dbMocks.query).toHaveBeenCalledOnce();
    const [sql, params] = dbMocks.query.mock.calls[0] as [string, unknown[]];
    const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ');

    expect(params).toEqual([
      'user-123',
      'subscription-123',
      periodStart.toISOString(),
      periodEnd.toISOString(),
      4_000,
      `subscription-123:${periodStart.toISOString()}:${periodEnd.toISOString()}:4000`,
    ]);
    expect(normalizedSql).toContain(
      'credits_allocated_cents = token_credits.credits_allocated_cents + $5',
    );
    expect(normalizedSql).not.toContain('credits_used_cents = 0');
    expect(normalizedSql).not.toContain('flagship_used_today_cents = 0');
    expect(normalizedSql).toContain("metadata->>'upgrade_allocation_key' = $6");
    expect(normalizedSql).toContain("'paid plan upgrade allocation'");
  });

  it('fails closed instead of silently resetting usage when no account can be carried', async () => {
    dbMocks.query.mockResolvedValue([]);

    await expect(
      CreditService.carryUsageIntoUpgradedPeriod(
        'user-123',
        'subscription-123',
        new Date('2026-07-18T18:00:00.000Z'),
        new Date('2026-08-18T18:00:00.000Z'),
        4_000,
        dbMocks as never,
      ),
    ).rejects.toThrow('No credit account found for paid-plan upgrade');
  });
});
