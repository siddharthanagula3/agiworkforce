import { describe, expect, it, vi } from 'vitest';

import {
  centsMirrorOfMicrousd,
  getAccountOverageMicrousd,
  getRollingUsage,
} from '@/lib/server/rolling-usage';

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

interface LedgerRow {
  account: string;
  type: 'deduction' | 'allocation' | 'purchase';
  microusd: number;
  overage: boolean;
  flagship: boolean;
}

/**
 * Max 5x account after a $20 top-up with usage credits on: 234.16 credits of
 * plan usage, then 383.59 credits of turns the reservation funded from usage
 * credits. Reservation and reconciliation rows net to each request's actual cost.
 */
const MAX_5X_LEDGER: LedgerRow[] = [
  { account: 'acct-1', type: 'allocation', microusd: 50_000_000, overage: false, flagship: false },
  { account: 'acct-1', type: 'purchase', microusd: 5_000_000, overage: false, flagship: false },
  { account: 'acct-1', type: 'deduction', microusd: 1_925_788, overage: false, flagship: false },
  { account: 'acct-1', type: 'deduction', microusd: -754_965, overage: false, flagship: false },
  { account: 'acct-1', type: 'deduction', microusd: 3_413_869, overage: true, flagship: false },
  { account: 'acct-1', type: 'deduction', microusd: -1_495_905, overage: true, flagship: false },
  { account: 'acct-0', type: 'deduction', microusd: 700_000, overage: true, flagship: false },
];

/**
 * Sums the ledger under exactly the predicates the statement carries, so a
 * query that forgets a filter sums rows it should have left out.
 */
function ledgerDb(rows: LedgerRow[]) {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    const planOnly = sql.includes("metadata->>'is_overage' is distinct from 'true'");
    const overageOnly = sql.includes("metadata->>'is_overage' = 'true'");
    const flagshipOnly = sql.includes("metadata->>'is_flagship' = 'true'");
    const byAccount = sql.includes('credit_account_id = $2');
    const total = rows
      .filter((row) => !sql.includes("transaction_type = 'deduction'") || row.type === 'deduction')
      .filter((row) => !planOnly || !row.overage)
      .filter((row) => !overageOnly || row.overage)
      .filter((row) => !flagshipOnly || row.flagship)
      .filter((row) => !byAccount || row.account === params[1])
      .reduce((sum, row) => sum + row.microusd, 0);
    return [{ used_microusd: String(total), overage_microusd: String(total), oldest_at: null }];
  });
  return { db: { query } as never, query };
}

describe('getRollingUsage · plan allowance only', () => {
  it('leaves turns paid from usage credits out of the 5-hour and weekly windows', async () => {
    const { db } = ledgerDb(MAX_5X_LEDGER);

    const session = await getRollingUsage(db, 'user_1', 5, false);
    const weekly = await getRollingUsage(db, 'user_1', 168, false);

    expect(session.usedMicrousd).toBe(1_170_823);
    expect(weekly.usedMicrousd).toBe(1_170_823);
  });

  it('leaves them out of the flagship window too', async () => {
    const { db } = ledgerDb([
      { account: 'acct-1', type: 'deduction', microusd: 400_000, overage: false, flagship: true },
      { account: 'acct-1', type: 'deduction', microusd: 900_000, overage: true, flagship: true },
    ]);

    const flagship = await getRollingUsage(db, 'user_1', 168, true);

    expect(flagship.usedMicrousd).toBe(400_000);
  });

  it('gives the whole allowance back once the plan turns leave the window', async () => {
    const { db } = ledgerDb([
      { account: 'acct-1', type: 'deduction', microusd: 1_917_964, overage: true, flagship: false },
    ]);

    const session = await getRollingUsage(db, 'user_1', 5, false);

    expect(session).toEqual({ usedMicrousd: 0, usedCents: 0, oldestAt: null });
  });
});

describe('getAccountOverageMicrousd · what usage credits paid for in a period', () => {
  it('nets the usage-credit turns booked to that credit period', async () => {
    const { db, query } = ledgerDb(MAX_5X_LEDGER);

    await expect(getAccountOverageMicrousd(db, 'user_1', 'acct-1')).resolves.toBe(1_917_964);
    expect(query.mock.calls[0]?.[1]).toEqual(['user_1', 'acct-1']);
  });

  it('reads a failure as no usage-credit spend, so the plan meter never over-reports what is left', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('neon down')) } as never;

    await expect(getAccountOverageMicrousd(db, 'user_1', 'acct-1')).resolves.toBe(0);
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
