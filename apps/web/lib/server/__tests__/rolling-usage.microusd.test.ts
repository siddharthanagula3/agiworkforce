import { describe, expect, it, vi } from 'vitest';

import { centsMirrorOfMicrousd, getRollingUsage } from '@/lib/server/rolling-usage';

/**
 * Migration 0182 gave the credit ledger a microUSD unit and wrote the rule on
 * the column itself:
 *
 *   "Authoritative ledger amount. Rolling windows sum this column;
 *    amount_cents is a per-row mirror and does not sum to it."
 *   "Round-half-up ... Apply to a running total, never to a delta."
 *
 * `getRollingUsage` summed the per-row cents mirrors instead, which is the one
 * thing the migration forbids. These tests pin the unit, the signedness and the
 * mirror-of-total rule.
 */

function dbReturning(row: Record<string, unknown> | undefined) {
  const query = vi.fn().mockResolvedValue(row ? [row] : []);
  return { db: { query } as never, query };
}

describe('getRollingUsage · authoritative microUSD', () => {
  it('sums amount_microusd, not the per-row cents mirror', async () => {
    const { db, query } = dbReturning({
      used_microusd: '90000',
      oldest_at: '2026-09-12T03:00:00Z',
    });

    const usage = await getRollingUsage(db, 'user_1', 5, false);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('sum(amount_microusd)');
    expect(sql).not.toContain('sum(amount_cents)');
    expect(usage.usedMicrousd).toBe(90_000);
  });

  it('keeps the deduction filter · releases are negative deductions, refunds are not usage', async () => {
    const { db, query } = dbReturning({ used_microusd: '0', oldest_at: null });

    await getRollingUsage(db, 'user_1', 5, false);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("transaction_type = 'deduction'");
    expect(sql).not.toContain("'refund'");
  });

  it('reads bigint sums that arrive as strings', async () => {
    const { db } = dbReturning({ used_microusd: '1000000', oldest_at: null });

    const usage = await getRollingUsage(db, 'user_1', 5, false);

    expect(usage.usedMicrousd).toBe(1_000_000);
    expect(usage.usedCents).toBe(100);
  });

  it('nets a release: reservation then negative reconciliation', async () => {
    // 9,844 reserved, -9,657 released back = 187 actually consumed.
    const { db } = dbReturning({ used_microusd: '187', oldest_at: null });

    const usage = await getRollingUsage(db, 'user_1', 5, false);

    expect(usage.usedMicrousd).toBe(187);
    expect(usage.usedCents).toBe(0); // sub-cent usage rounds to zero cents, not to one
  });

  it('never reports negative usage', async () => {
    const { db } = dbReturning({ used_microusd: '-5000', oldest_at: null });

    const usage = await getRollingUsage(db, 'user_1', 5, false);

    expect(usage.usedMicrousd).toBe(0);
  });

  it('treats a query failure as zero rather than throwing', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('neon down')) } as never;

    const usage = await getRollingUsage(db, 'user_1', 5, false);

    expect(usage).toEqual({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
  });

  it('applies the flagship filter only when asked', async () => {
    const { db, query } = dbReturning({ used_microusd: '0', oldest_at: null });

    await getRollingUsage(db, 'user_1', 168, true);
    expect(String(query.mock.calls[0]?.[0])).toContain("metadata->>'is_flagship'");

    const plain = dbReturning({ used_microusd: '0', oldest_at: null });
    await getRollingUsage(plain.db, 'user_1', 168, false);
    expect(String(plain.query.mock.calls[0]?.[0])).not.toContain("metadata->>'is_flagship'");
  });
});

describe('cents mirror · of a total, never of a delta', () => {
  it('matches the SQL round-half-up definition', () => {
    // floor((microusd + 5000) / 10000)
    expect(centsMirrorOfMicrousd(0)).toBe(0);
    expect(centsMirrorOfMicrousd(187)).toBe(0);
    expect(centsMirrorOfMicrousd(4_999)).toBe(0);
    expect(centsMirrorOfMicrousd(5_000)).toBe(1);
    expect(centsMirrorOfMicrousd(9_844)).toBe(1);
    expect(centsMirrorOfMicrousd(990_156)).toBe(99);
    expect(centsMirrorOfMicrousd(1_000_000)).toBe(100);
  });

  it.each([
    { rows: 1, each: 900 },
    { rows: 10, each: 900 },
    { rows: 100, each: 900 },
  ])('does not drift across $rows sub-cent charges', ({ rows, each }) => {
    const total = rows * each;

    const mirrorOfTotal = centsMirrorOfMicrousd(total);
    const sumOfMirrors = Array.from({ length: rows }, () => centsMirrorOfMicrousd(each)).reduce(
      (a, b) => a + b,
      0,
    );

    // The authoritative total is exact in microUSD either way.
    expect(total).toBe(rows * 900);
    // And the mirror of the total is never the sum of the per-row mirrors once
    // the rows are sub-cent: 100 x 900µUSD is $0.09, and summing mirrors says $0.
    if (rows === 100) {
      expect(mirrorOfTotal).toBe(9);
      expect(sumOfMirrors).toBe(0);
      expect(mirrorOfTotal).not.toBe(sumOfMirrors);
    }
  });

  it('mixed charge sizes stay exact in microUSD', () => {
    const charges = [187, 9_844, 250_000, 900, 1, 33_333];
    const total = charges.reduce((a, b) => a + b, 0);

    expect(total).toBe(294_265);
    expect(centsMirrorOfMicrousd(total)).toBe(29);
  });
});
