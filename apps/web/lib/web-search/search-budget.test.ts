import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const countUserFeatureUnitsSince = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  countUserFeatureUnitsSince,
  getOrganizationMonthToDateSpendCents: vi.fn(),
  recordSettledProviderCost: vi.fn(),
}));

const settleCreditsDurably = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { settleCreditsDurably },
  CreditSettlementUnavailableError: class extends Error {},
}));

const reserveManagedUsageRequest = vi.hoisted(() => vi.fn());
const finalizeManagedUsageRequest = vi.hoisted(() => vi.fn());
const TestManagedUsageRequestError = vi.hoisted(
  () =>
    class extends Error {
      constructor(
        message: string,
        readonly status: number,
        readonly code: string,
      ) {
        super(message);
      }
    },
);
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageRequest,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest: (value: unknown) => JSON.stringify(value),
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number; estimatedCostCents: number }) =>
    source.estimatedCostMicrousd ?? source.estimatedCostCents * 10_000,
  ManagedUsageRequestError: TestManagedUsageRequestError,
}));

import {
  FREE_PLAN_MONTHLY_SEARCH_CALLS,
  PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS,
  reserveSearchCharge,
  resolveSearchBudget,
  resolveSearchCallerKind,
  searchChargeCents,
  searchChargeIdempotencyKey,
  settleSearchCharge,
} from './search-budget';

const db = {} as never;

const reserveInput = {
  userId: 'user-1',
  planTier: 'pro',
  requestId: 'req-1',
  callOrdinal: 1,
  feature: 'web_search_perplexity',
  provider: 'perplexity',
  chargeMicrousd: 10_000,
  db,
} as const;

beforeEach(() => {
  countUserFeatureUnitsSince.mockReset();
  settleCreditsDurably.mockReset();
  settleCreditsDurably.mockResolvedValue({ status: 'succeeded', success: true, attempt_count: 1 });
  reserveManagedUsageRequest.mockReset();
  reserveManagedUsageRequest.mockImplementation(async (input: Record<string, unknown>) => ({
    db: input['db'],
    userId: input['userId'],
    idempotencyKey: input['idempotencyKey'],
    requestHash: input['requestHash'],
    leaseToken: 'lease-1',
    estimatedCostMicrousd: input['estimatedCostMicrousd'],
    estimatedCostCents: 1,
  }));
  finalizeManagedUsageRequest.mockReset();
  finalizeManagedUsageRequest.mockResolvedValue({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostMicrousd: 10_000,
    actualCostCents: 1,
  });
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
      chargeMicrousd: 10_000,
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
    expect(decision).toMatchObject({ outcome: 'charge', chargeMicrousd: 20_000, chargeCents: 2 });
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
      chargeMicrousd: 10_000,
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

describe('reserveSearchCharge', () => {
  it('keys each call so a retry cannot charge twice', () => {
    expect(searchChargeIdempotencyKey('req-1', 2)).toBe('search:req-1:2');
    expect(searchChargeIdempotencyKey('req-1', 0, 'grounding')).toBe('search:req-1:grounding:0');
  });

  it('holds the charge against the canonical owner before the search runs', async () => {
    const outcome = await reserveSearchCharge({ ...reserveInput, scope: 'tool' });
    expect(outcome.outcome).toBe('reserved');
    const held = reserveManagedUsageRequest.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(held['idempotencyKey']).toBe('search:req-1:1');
    expect(held['estimatedCostMicrousd']).toBe(10_000);
    expect(held['quotaFeature']).toBe('search');
    expect(held['provider']).toBe('perplexity');
    expect(held['model']).toBe('web_search_perplexity');
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('refuses the call when the account is over quota', async () => {
    reserveManagedUsageRequest.mockRejectedValue(
      new TestManagedUsageRequestError('no budget', 402, 'insufficient_credits'),
    );
    const outcome = await reserveSearchCharge(reserveInput);
    expect(outcome.outcome).toBe('refused');
  });

  it('refuses the call when a rolling usage limit is reached', async () => {
    reserveManagedUsageRequest.mockRejectedValue(
      new TestManagedUsageRequestError('slow down', 429, 'rolling_weekly_limit_reached'),
    );
    expect((await reserveSearchCharge(reserveInput)).outcome).toBe('refused');
  });

  it('lets the call run when billing itself is unreachable', async () => {
    reserveManagedUsageRequest.mockRejectedValue(new Error('billing down'));
    expect((await reserveSearchCharge(reserveInput)).outcome).toBe('unreserved');
  });

  it('never reserves for a zero charge', async () => {
    const outcome = await reserveSearchCharge({ ...reserveInput, chargeMicrousd: 0 });
    expect(outcome.outcome).toBe('unreserved');
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });
});

describe('settleSearchCharge', () => {
  it('settles the held amount through the canonical owner', async () => {
    const outcome = await reserveSearchCharge(reserveInput);
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');
    await settleSearchCharge({
      userId: 'user-1',
      reservation: outcome.reservation,
      surface: 'cli',
      db,
    });
    const settled = finalizeManagedUsageRequest.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      leaseToken: string;
      actualCostMicrousd: number;
      quotaFeature: string;
      usage: Record<string, unknown>;
    };
    expect(settled.idempotencyKey).toBe('search:req-1:1');
    expect(settled.leaseToken).toBe('lease-1');
    expect(settled.actualCostMicrousd).toBe(10_000);
    expect(settled.quotaFeature).toBe('search');
    expect(settled.usage['surface']).toBe('cli');
    expect(settleCreditsDurably).not.toHaveBeenCalled();
  });

  it('leaves the hold to recovery when settlement cannot be written', async () => {
    const outcome = await reserveSearchCharge(reserveInput);
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');
    finalizeManagedUsageRequest.mockRejectedValue(new Error('settlement down'));
    await expect(
      settleSearchCharge({ userId: 'user-1', reservation: outcome.reservation, db }),
    ).resolves.toBeUndefined();
  });
});
