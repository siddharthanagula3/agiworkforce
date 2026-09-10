import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const countUserFeatureUnitsSince = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', () => ({ countUserFeatureUnitsSince }));

const settleCreditsDurably = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { settleCreditsDurably },
  CreditSettlementUnavailableError: class extends Error {},
}));

import {
  FREE_PLAN_MONTHLY_SEARCH_CALLS,
  PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS,
  resolveSearchBudget,
  resolveSearchCallerKind,
  searchChargeCents,
  searchChargeIdempotencyKey,
  settleSearchCharge,
} from './search-budget';

const db = {} as never;

beforeEach(() => {
  countUserFeatureUnitsSince.mockReset();
  settleCreditsDurably.mockReset();
  settleCreditsDurably.mockResolvedValue({ status: 'succeeded', success: true, attempt_count: 1 });
});

describe('resolveSearchCallerKind', () => {
  it('treats developer credentials as automated', () => {
    for (const surface of ['api', 'cli', 'vscode']) {
      expect(resolveSearchCallerKind({ surface })).toBe('automated');
    }
  });

  it('treats a person chatting on a product surface as interactive', () => {
    for (const surface of ['web', 'mobile', 'desktop', 'chrome']) {
      expect(resolveSearchCallerKind({ surface })).toBe('interactive');
    }
  });

  it('treats agi work, research and scheduled runs as automated whatever the surface', () => {
    expect(resolveSearchCallerKind({ surface: 'web', agiWork: true })).toBe('automated');
    expect(resolveSearchCallerKind({ surface: 'web', research: true })).toBe('automated');
    expect(resolveSearchCallerKind({ surface: 'web', scheduled: true })).toBe('automated');
  });
});

describe('search charge', () => {
  it('is the provider cost rounded up to a whole cent', () => {
    expect(searchChargeCents('web_search_perplexity')).toBe(1);
    expect(searchChargeCents('web_search_grounding')).toBe(2);
  });
});

describe('free plan bound', () => {
  it('includes a search while the account is under its monthly calls', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(FREE_PLAN_MONTHLY_SEARCH_CALLS - 1);
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'free',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({ outcome: 'included' });
  });

  it('blocks rather than charges once the free calls are spent', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(FREE_PLAN_MONTHLY_SEARCH_CALLS);
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'free',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({ outcome: 'blocked', reason: 'plan_bound' });
  });

  it('counts the window back thirty days from now', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(0);
    const now = new Date('2026-09-10T00:00:00.000Z');
    await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'free',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
      now,
    });
    const since = countUserFeatureUnitsSince.mock.calls[0]?.[2] as Date;
    expect(since.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });
});

describe('automated and developer surfaces', () => {
  it('charges without consulting the included-call count', async () => {
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'max',
      feature: 'web_search_perplexity',
      callerKind: 'automated',
      db,
    });
    expect(decision).toEqual({
      outcome: 'charge',
      feature: 'web_search_perplexity',
      chargeCents: 1,
    });
    expect(countUserFeatureUnitsSince).not.toHaveBeenCalled();
  });

  it('charges a grounded call two cents', async () => {
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'pro',
      feature: 'web_search_grounding',
      callerKind: 'automated',
      db,
    });
    expect(decision).toMatchObject({ outcome: 'charge', chargeCents: 2 });
  });
});

describe('paid plan interactive bound', () => {
  it('includes an interactive search under the paid bound', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS - 1);
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'pro',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({ outcome: 'included' });
  });

  it('charges rather than blocks past the paid bound', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS);
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'pro',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({
      outcome: 'charge',
      feature: 'web_search_perplexity',
      chargeCents: 1,
    });
  });

  it('never charges from a count it could not read', async () => {
    countUserFeatureUnitsSince.mockRejectedValue(new Error('ledger down'));
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'pro',
      feature: 'web_search_perplexity',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({ outcome: 'included' });
  });
});

describe('settleSearchCharge', () => {
  it('keys each call so a retry cannot charge twice', () => {
    expect(searchChargeIdempotencyKey('req-1', 2)).toBe('search:req-1:2');
    expect(searchChargeIdempotencyKey('req-1', 0, 'grounding')).toBe('search:req-1:grounding:0');
  });

  it('records the search as its own quota feature', async () => {
    await settleSearchCharge({
      userId: 'user-1',
      requestId: 'req-1',
      callOrdinal: 1,
      feature: 'web_search_perplexity',
      chargeCents: 1,
      surface: 'cli',
      db,
    });
    const operation = settleCreditsDurably.mock.calls[0]?.[0] as {
      amountCents: number;
      idempotencyKey: string;
      metadata: Record<string, unknown>;
    };
    expect(operation.amountCents).toBe(1);
    expect(operation.idempotencyKey).toBe('search:req-1:1');
    expect(operation.metadata['quotaFeature']).toBe('search');
    expect(operation.metadata['surface']).toBe('cli');
  });

  it('refuses the call when the account cannot pay', async () => {
    settleCreditsDurably.mockResolvedValue({
      status: 'terminal',
      success: false,
      code: 'insufficient_credits',
      attempt_count: 1,
    });
    await expect(
      settleSearchCharge({
        userId: 'user-1',
        requestId: 'req-1',
        callOrdinal: 1,
        feature: 'web_search_perplexity',
        chargeCents: 1,
        db,
      }),
    ).resolves.toBe(false);
  });

  it('lets the call run when the settlement backend is unreachable', async () => {
    settleCreditsDurably.mockRejectedValue(new Error('settlement down'));
    await expect(
      settleSearchCharge({
        userId: 'user-1',
        requestId: 'req-1',
        callOrdinal: 1,
        feature: 'web_search_perplexity',
        chargeCents: 1,
        db,
      }),
    ).resolves.toBe(true);
  });

  it('never calls settlement for a zero charge', async () => {
    await expect(
      settleSearchCharge({
        userId: 'user-1',
        requestId: 'req-1',
        callOrdinal: 1,
        feature: 'web_search_perplexity',
        chargeCents: 0,
        db,
      }),
    ).resolves.toBe(true);
    expect(settleCreditsDurably).not.toHaveBeenCalled();
  });
});
