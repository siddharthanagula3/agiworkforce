import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  evaluateCodeHarnessDailyCeiling,
  getCodeHarnessDailySpendCents,
} from '@/lib/e2b/provider-proxy-budget';

const query = vi.fn();
const db = { query } as unknown as DatabaseAdapter;

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([{ spent_cents: 0 }]);
});

describe('coding-harness daily spend', () => {
  it('counts both the tagged rows and the ones still holding a lease, over a 24-hour window', async () => {
    query.mockResolvedValue([{ spent_cents: '431' }]);
    expect(await getCodeHarnessDailySpendCents(db, 'user-1')).toBe(431);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('coalesce(actual_cost_cents, estimated_cost_cents)');
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("status <> 'declined'");
    expect(params).toEqual(['user-1', 'code_harness', 'code-proxy:%']);
  });

  it('reads an empty ledger as no spend', async () => {
    query.mockResolvedValue([]);
    expect(await getCodeHarnessDailySpendCents(db, 'user-1')).toBe(0);
  });
});

describe('coding-harness daily ceiling', () => {
  it('admits an estimate that fits and refuses the one that crosses', async () => {
    query.mockResolvedValue([{ spent_cents: 480 }]);
    const fits = await evaluateCodeHarnessDailyCeiling({
      db,
      userId: 'user-1',
      planTier: 'pro',
      estimatedCostCents: 20,
    });
    expect(fits).toMatchObject({ allowed: true, ceilingCents: 500, spentCents: 480 });

    const crosses = await evaluateCodeHarnessDailyCeiling({
      db,
      userId: 'user-1',
      planTier: 'pro',
      estimatedCostCents: 21,
    });
    expect(crosses.allowed).toBe(false);
  });

  it('gives a larger plan more room than a smaller one', async () => {
    query.mockResolvedValue([{ spent_cents: 1000 }]);
    const pro = await evaluateCodeHarnessDailyCeiling({
      db,
      userId: 'user-1',
      planTier: 'pro',
      estimatedCostCents: 1,
    });
    const max = await evaluateCodeHarnessDailyCeiling({
      db,
      userId: 'user-1',
      planTier: 'max',
      estimatedCostCents: 1,
    });
    expect(pro.allowed).toBe(false);
    expect(max.allowed).toBe(true);
  });

  it('refuses a plan with no coding-harness ceiling without touching the database', async () => {
    for (const planTier of ['free', 'local-only', 'byok', 'hobby', null]) {
      const decision = await evaluateCodeHarnessDailyCeiling({
        db,
        userId: 'user-1',
        planTier,
        estimatedCostCents: 1,
      });
      expect(decision.allowed).toBe(false);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses rather than guesses when the ledger cannot be read', async () => {
    query.mockRejectedValue(new Error('neon unreachable'));
    const decision = await evaluateCodeHarnessDailyCeiling({
      db,
      userId: 'user-1',
      planTier: 'pro',
      estimatedCostCents: 1,
    });
    expect(decision.allowed).toBe(false);
  });
});
