import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/cogs-ledger-service');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const countUserFeatureUnitsSince = vi.hoisted(() => vi.fn());
const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  countUserFeatureUnitsSince,
  getOrganizationMonthToDateSpendCents: vi.fn(),
  recordSettledProviderCost,
}));

const settleCreditsDurably = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: {
    settleCreditsDurably,
    generateIdempotencyKey: (userId: string, kind: string, ref: string) =>
      `${userId}:${kind}:${ref}`,
  },
  CreditSettlementUnavailableError: class extends Error {},
}));

const reserveManagedUsageRequest = vi.hoisted(() => vi.fn());
const finalizeManagedUsageRequest = vi.hoisted(() => vi.fn());
const markManagedUsageProviderStarted = vi.hoisted(() => vi.fn());
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
  markManagedUsageProviderStarted,
  ManagedUsageRequestError: TestManagedUsageRequestError,
}));

import { chargeMicrousdForProviderCost, resolveFeatureRate } from '@agiworkforce/types';
import {
  managedUsageCostSourceRef,
  resolveCogsCapability,
  resolveCogsUnits,
} from '@/lib/services/cogs-ledger-service';
import {
  FREE_PLAN_MONTHLY_SEARCH_CALLS,
  includedMonthlySearchCalls,
  INCLUDED_SEARCH_ADMISSION,
  readSearchAllowance,
  reserveSearchCharge,
  resolveSearchBudget,
  resolveSearchCallerKind,
  searchChargeIdempotencyKey,
  settleSearchCall,
  type SearchAdmission,
  type SearchCallSettlement,
} from './search-budget';

const db = {} as never;

const PERPLEXITY_PROVIDER_MICROUSD = resolveFeatureRate('web_search_perplexity')
  .providerCogsMicrousd as number;
const PERPLEXITY_CHARGE_MICROUSD = chargeMicrousdForProviderCost(PERPLEXITY_PROVIDER_MICROUSD);

const reserveInput = {
  userId: 'user-1',
  planTier: 'pro',
  requestId: 'req-1',
  callRef: 1,
  feature: 'web_search_perplexity',
  provider: 'perplexity',
  chargeMicrousd: PERPLEXITY_CHARGE_MICROUSD,
  db,
} as const;

function settlement(
  admission: SearchAdmission,
  overrides: Partial<SearchCallSettlement> = {},
): SearchCallSettlement {
  return {
    userId: 'user-1',
    admission,
    feature: 'web_search_perplexity',
    provider: 'perplexity',
    tool: 'perplexity_search',
    calls: 1,
    providerCostMicrousd: PERPLEXITY_PROVIDER_MICROUSD,
    charged: true,
    delivered: true,
    costRef: 'perplexity_search:turn-1:1',
    taskRef: 'turn-1',
    surface: 'cli',
    db,
    ...overrides,
  };
}

async function reservedAdmission(): Promise<Extract<SearchAdmission, { kind: 'reserved' }>> {
  const outcome = await reserveSearchCharge(reserveInput);
  if (outcome.outcome !== 'admitted' || outcome.admission.kind !== 'reserved') {
    throw new Error('expected a reservation');
  }
  return outcome.admission;
}

beforeEach(() => {
  countUserFeatureUnitsSince.mockReset();
  recordSettledProviderCost.mockReset();
  recordSettledProviderCost.mockResolvedValue(undefined);
  markManagedUsageProviderStarted.mockReset();
  markManagedUsageProviderStarted.mockResolvedValue(undefined);
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

describe('free plan bound', () => {
  it('reports the remaining Free search allowance from the same rolling count as admission', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(FREE_PLAN_MONTHLY_SEARCH_CALLS - 1);
    await expect(readSearchAllowance({ userId: 'user-1', planTier: 'free', db })).resolves.toEqual({
      status: 'available',
      used: FREE_PLAN_MONTHLY_SEARCH_CALLS - 1,
      limit: FREE_PLAN_MONTHLY_SEARCH_CALLS,
      windowDays: 30,
    });
    countUserFeatureUnitsSince.mockResolvedValue(FREE_PLAN_MONTHLY_SEARCH_CALLS);
    await expect(readSearchAllowance({ userId: 'user-1', planTier: 'free', db })).resolves.toEqual({
      status: 'exhausted',
      used: FREE_PLAN_MONTHLY_SEARCH_CALLS,
      limit: FREE_PLAN_MONTHLY_SEARCH_CALLS,
      windowDays: 30,
    });
  });

  it('does not claim search is available when its count cannot be read', async () => {
    countUserFeatureUnitsSince.mockRejectedValue(new Error('ledger down'));
    await expect(readSearchAllowance({ userId: 'user-1', planTier: 'free', db })).resolves.toEqual({
      status: 'unknown',
      limit: FREE_PLAN_MONTHLY_SEARCH_CALLS,
      windowDays: 30,
    });
  });

  it('does not apply the Free search bound to a paid account', async () => {
    await expect(readSearchAllowance({ userId: 'user-1', planTier: 'pro', db })).resolves.toEqual({
      status: 'paid',
    });
    expect(countUserFeatureUnitsSince).not.toHaveBeenCalled();
  });

  it('includes a search while the account is under its monthly calls', async () => {
    countUserFeatureUnitsSince.mockResolvedValue(FREE_PLAN_MONTHLY_SEARCH_CALLS - 1);
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'free',
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
      callerKind: 'automated',
      db,
    });
    expect(decision).toEqual({ outcome: 'charge' });
    expect(countUserFeatureUnitsSince).not.toHaveBeenCalled();
  });

  it('charges an automated caller on the Free plan too, never through the Free bound', async () => {
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'free',
      callerKind: 'automated',
      db,
    });
    expect(decision).toEqual({ outcome: 'charge' });
    expect(countUserFeatureUnitsSince).not.toHaveBeenCalled();
  });
});

describe('paid plan interactive search', () => {
  it('charges every interactive search on a paid plan without reading a count', async () => {
    const decision = await resolveSearchBudget({
      userId: 'user-1',
      planTier: 'pro',
      callerKind: 'interactive',
      db,
    });
    expect(decision).toEqual({ outcome: 'charge' });
    expect(countUserFeatureUnitsSince).not.toHaveBeenCalled();
  });

  it('includes no searches in a paid plan', () => {
    expect(includedMonthlySearchCalls('pro')).toBe(0);
    expect(includedMonthlySearchCalls('max_15x')).toBe(0);
    expect(includedMonthlySearchCalls('free')).toBe(FREE_PLAN_MONTHLY_SEARCH_CALLS);
  });
});

describe('reserveSearchCharge', () => {
  it('keys each call so a retry cannot charge twice', () => {
    expect(searchChargeIdempotencyKey('req-1', 2)).toBe('search:req-1:2');
    expect(searchChargeIdempotencyKey('req-1', 0, 'grounding')).toBe('search:req-1:grounding:0');
    expect(searchChargeIdempotencyKey('req-1', 3, 'places')).toBe('search:req-1:places:3');
  });

  it('holds the charge against the canonical owner before the search runs', async () => {
    const outcome = await reserveSearchCharge({ ...reserveInput, scope: 'tool' });
    expect(outcome).toEqual({
      outcome: 'admitted',
      admission: {
        kind: 'reserved',
        charge: {
          idempotencyKey: 'search:req-1:1',
          chargeMicrousd: PERPLEXITY_CHARGE_MICROUSD,
          provider: 'perplexity',
          feature: 'web_search_perplexity',
        },
        requestHash: expect.any(String),
        leaseToken: 'lease-1',
      },
    });
    const held = reserveManagedUsageRequest.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(held['idempotencyKey']).toBe('search:req-1:1');
    expect(held['estimatedCostMicrousd']).toBe(PERPLEXITY_CHARGE_MICROUSD);
    expect(held['quotaFeature']).toBe('search');
    expect(held['provider']).toBe('perplexity');
    expect(held['model']).toBe('web_search_perplexity');
    expect(held['planTier']).toBe('pro');
    expect(held['isFlagship']).toBe(false);
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('refuses the call when the account is over quota', async () => {
    const refusal = new TestManagedUsageRequestError('no budget', 402, 'insufficient_credits');
    reserveManagedUsageRequest.mockRejectedValue(refusal);
    await expect(reserveSearchCharge(reserveInput)).resolves.toEqual({
      outcome: 'refused',
      error: refusal,
    });
  });

  it('refuses the call when a rolling usage limit is reached', async () => {
    reserveManagedUsageRequest.mockRejectedValue(
      new TestManagedUsageRequestError('slow down', 429, 'rolling_weekly_limit_reached'),
    );
    expect((await reserveSearchCharge(reserveInput)).outcome).toBe('refused');
  });

  it('lets the call run and queues its charge when billing itself is unreachable', async () => {
    reserveManagedUsageRequest.mockRejectedValue(new Error('billing down'));
    await expect(reserveSearchCharge(reserveInput)).resolves.toEqual({
      outcome: 'admitted',
      admission: {
        kind: 'deferred',
        charge: {
          idempotencyKey: 'search:req-1:1',
          chargeMicrousd: PERPLEXITY_CHARGE_MICROUSD,
          provider: 'perplexity',
          feature: 'web_search_perplexity',
        },
      },
    });
  });

  it('never reserves for a zero charge', async () => {
    const outcome = await reserveSearchCharge({ ...reserveInput, chargeMicrousd: 0 });
    expect(outcome).toEqual({ outcome: 'admitted', admission: INCLUDED_SEARCH_ADMISSION });
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });
});

describe('settleSearchCall', () => {
  it('settles the held charge through the canonical owner and records one COGS row at provider cost', async () => {
    const admission = await reservedAdmission();

    await settleSearchCall(settlement(admission));

    expect(markManagedUsageProviderStarted).toHaveBeenCalledTimes(1);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledTimes(1);
    const settled = finalizeManagedUsageRequest.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(settled['idempotencyKey']).toBe('search:req-1:1');
    expect(settled['leaseToken']).toBe('lease-1');
    expect(settled['outcome']).toBe('completed');
    expect(settled['actualCostMicrousd']).toBe(PERPLEXITY_CHARGE_MICROUSD);
    expect(settled['providerCostMicrousd']).toBe(PERPLEXITY_PROVIDER_MICROUSD);
    expect(settled['quotaFeature']).toBe('search');
    expect((settled['usage'] as Record<string, unknown>)['surface']).toBe('cli');

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'perplexity',
        providerEstimatedCostMicrousd: PERPLEXITY_PROVIDER_MICROUSD,
        customerCanonicalMicrousd: PERPLEXITY_CHARGE_MICROUSD,
        sourceRef: managedUsageCostSourceRef({
          userId: 'user-1',
          idempotencyKey: admission.charge.idempotencyKey,
          requestHash: admission.requestHash,
        }),
        taskOutcome: 'delivered',
        feature: 'web_search_perplexity',
      }),
    );
    expect(settleCreditsDurably).not.toHaveBeenCalled();
  });

  it('releases the hold at no charge but still records the vendor spend of a call that failed', async () => {
    const admission = await reservedAdmission();

    await settleSearchCall(settlement(admission, { charged: false, delivered: false }));

    expect(markManagedUsageProviderStarted).not.toHaveBeenCalled();
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEstimatedCostMicrousd: PERPLEXITY_PROVIDER_MICROUSD,
        customerCanonicalMicrousd: 0,
        sourceRef: 'perplexity_search:turn-1:1',
        taskOutcome: 'undelivered',
      }),
    );
  });

  it('records an included call as vendor spend with nothing charged', async () => {
    await settleSearchCall(settlement(INCLUDED_SEARCH_ADMISSION, { calls: 2 }));

    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
    expect(settleCreditsDurably).not.toHaveBeenCalled();
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEstimatedCostMicrousd: PERPLEXITY_PROVIDER_MICROUSD,
        customerCanonicalMicrousd: 0,
        sourceRef: 'perplexity_search:turn-1:1',
      }),
    );
    const usage = (
      recordSettledProviderCost.mock.calls[0]?.[0] as { usage: Record<string, unknown> }
    ).usage;
    expect(resolveCogsCapability(usage)).toBe('tool');
    expect(resolveCogsUnits('tool', usage)).toEqual({ unitBasis: 'request', units: 2 });
  });

  it('queues the charge of a call whose hold could not be placed', async () => {
    reserveManagedUsageRequest.mockRejectedValue(new Error('billing down'));
    const outcome = await reserveSearchCharge(reserveInput);
    if (outcome.outcome !== 'admitted') throw new Error('expected an admission');

    await settleSearchCall(settlement(outcome.admission));

    expect(settleCreditsDurably).toHaveBeenCalledTimes(1);
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountMicrousd: PERPLEXITY_CHARGE_MICROUSD,
        idempotencyKey: 'user-1:reconciliation:search:req-1:1:deferred',
      }),
      db,
    );
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        customerCanonicalMicrousd: PERPLEXITY_CHARGE_MICROUSD,
        sourceRef: 'perplexity_search:turn-1:1',
      }),
    );
  });

  it('writes nothing for a call that cost nothing and charged nothing', async () => {
    await settleSearchCall(
      settlement(INCLUDED_SEARCH_ADMISSION, { calls: 0, providerCostMicrousd: 0 }),
    );

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('leaves the hold to recovery when settlement cannot be written', async () => {
    const admission = await reservedAdmission();
    finalizeManagedUsageRequest.mockRejectedValue(new Error('settlement down'));
    await expect(settleSearchCall(settlement(admission))).resolves.toBeUndefined();
  });
});
