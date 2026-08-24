import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  __clearSpendCacheForTests,
  evaluateSpendLimit,
  invalidateSpendDecision,
  readSpendState,
  SPEND_CACHE_TTL_MS,
} from '../spend-limit-service';

const ORG = '11111111-1111-4111-8111-111111111111';

function harness({
  cap = 10_000 as number | null,
  enforcement = 'block' as string,
  threshold = 80,
  spent = 5_000 as number | string,
  throws = false,
} = {}) {
  const query = vi.fn(async (_sql?: string, _params?: unknown[]) => {
    if (throws) throw new Error('billing table unavailable');
    if (cap === null) return [];
    return [
      {
        monthly_cap_cents: cap,
        enforcement,
        alert_threshold_pct: threshold,
        spent_cents: spent,
      },
    ];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearSpendCacheForTests();
});

describe('readSpendState', () => {
  it('reads the cap and the month-to-date spend in one round trip', async () => {
    // Two queries would double the latency this adds to every governed turn,
    // and could disagree if a write landed between them.
    const h = harness();
    await readSpendState(h.db, ORG);
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('sums only settled turns, within the calendar month', async () => {
    const h = harness();
    await readSpendState(h.db, ORG);
    const sql = String(h.query.mock.calls[0]?.[0]);

    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("date_trunc('month', now())");
  });

  it('reports an unconfigured workspace rather than a zero cap', async () => {
    // A zero cap would refuse every turn. "No limit" and "a limit of nothing"
    // must never collapse into the same value.
    const h = harness({ cap: null });
    const state = await readSpendState(h.db, ORG);

    expect(state.configured).toBe(false);
    expect(state.monthlyCapCents).toBeNull();
    expect(state.usedPct).toBeNull();
  });

  it('computes the used percentage against the cap', async () => {
    const h = harness({ cap: 10_000, spent: 2_500 });
    expect((await readSpendState(h.db, ORG)).usedPct).toBe(25);
  });

  it('sums a numeric string rather than concatenating it', async () => {
    const h = harness({ spent: '7500' });
    expect((await readSpendState(h.db, ORG)).spentCents).toBe(7500);
  });

  it('flags the alert threshold separately from the cap', async () => {
    const h = harness({ cap: 10_000, threshold: 80, spent: 8_500 });
    const state = await readSpendState(h.db, ORG);

    expect(state.overThreshold).toBe(true);
    expect(state.overCap).toBe(false);
  });
});

describe('evaluateSpendLimit', () => {
  it('allows a personal-scope caller', async () => {
    const h = harness();
    expect((await evaluateSpendLimit(h.db, null)).code).toBe('ungoverned');
    expect(h.query).not.toHaveBeenCalled();
  });

  it('allows a workspace with no limit', async () => {
    const h = harness({ cap: null });
    expect((await evaluateSpendLimit(h.db, ORG)).allowed).toBe(true);
  });

  it('refuses a blocking workspace that is over its cap', async () => {
    const h = harness({ enforcement: 'block', cap: 10_000, spent: 10_000 });
    const decision = await evaluateSpendLimit(h.db, ORG);

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('over_cap');
    expect(decision.reason).toMatch(/monthly spend limit/i);
  });

  it('NOTIFY never refuses, however far over the cap', async () => {
    // notify exists so a finance owner can watch a budget before deciding to
    // enforce it. Turning it into a refusal is the opposite of what they asked.
    const h = harness({ enforcement: 'notify', cap: 10_000, spent: 90_000 });
    expect((await evaluateSpendLimit(h.db, ORG)).allowed).toBe(true);
  });

  it('OFF never refuses', async () => {
    const h = harness({ enforcement: 'off', cap: 10_000, spent: 90_000 });
    expect((await evaluateSpendLimit(h.db, ORG)).allowed).toBe(true);
  });

  it('allows a blocking workspace still under its cap', async () => {
    const h = harness({ enforcement: 'block', cap: 10_000, spent: 9_999 });
    expect((await evaluateSpendLimit(h.db, ORG)).allowed).toBe(true);
  });

  it('does not refuse work when the billing lookup fails', async () => {
    // Refusing every member's work because the spend table blipped is worse
    // than briefly overshooting a cap.
    const h = harness({ throws: true });
    const decision = await evaluateSpendLimit(h.db, ORG);

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ungoverned');
  });

  it('reuses a decision within the cache window rather than re-summing', async () => {
    const h = harness();
    await evaluateSpendLimit(h.db, ORG, { now: 1_000 });
    await evaluateSpendLimit(h.db, ORG, { now: 1_000 + SPEND_CACHE_TTL_MS - 1 });
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the cache window has passed', async () => {
    const h = harness();
    await evaluateSpendLimit(h.db, ORG, { now: 1_000 });
    await evaluateSpendLimit(h.db, ORG, { now: 1_000 + SPEND_CACHE_TTL_MS + 1 });
    expect(h.query).toHaveBeenCalledTimes(2);
  });

  it('frees a workspace at once when its cap is raised', async () => {
    // Otherwise an admin raising the cap watches their team stay blocked for a
    // window with no explanation.
    const h = harness({ enforcement: 'block', cap: 10_000, spent: 10_000 });
    expect((await evaluateSpendLimit(h.db, ORG, { now: 1_000 })).allowed).toBe(false);

    invalidateSpendDecision(ORG);
    const raised = harness({ enforcement: 'block', cap: 50_000, spent: 10_000 });
    expect((await evaluateSpendLimit(raised.db, ORG, { now: 1_000 })).allowed).toBe(true);
  });

  it('caches per organization, never across them', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const h = harness({ enforcement: 'block', cap: 10_000, spent: 10_000 });

    expect((await evaluateSpendLimit(h.db, ORG, { now: 1_000 })).allowed).toBe(false);
    const permissive = harness({ cap: null });
    expect((await evaluateSpendLimit(permissive.db, other, { now: 1_000 })).allowed).toBe(true);
  });
});
