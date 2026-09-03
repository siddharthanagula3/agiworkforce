import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const fixture = {
    id: 'fixture-retail-model',
    provider: 'openai',
    inputCost: 2,
    outputCost: 8,
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id ? fixture : actual.getModelMetadataById(id),
  };
});

const FIXTURE_RETAIL_MODEL = 'fixture-retail-model';

import {
  getServedRouteIdFromCostEventMetadata,
  getValueMultiplierFromCostEvent,
  importStripeCogsAdjustments,
  recordCogsAdjustment,
  recordProviderCostEvent,
  recordSettledProviderCost,
  resolveCogsCapability,
  resolveCogsUnits,
  resolveRetailCostCents,
  summarizeCogs,
} from '@/lib/services/cogs-ledger-service';
import {
  LLMCostCalculator,
  setRouteRegistryPricingLookup,
} from '@/lib/services/llm-cost-calculator';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  observedProviderUsageLedgerCents,
} from '@/lib/services/managed-usage-accounting-service';

function fakeDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => 1),
  };
}

describe('cogs ledger · capability and unit resolution', () => {
  it('meters an image generation per image, not per token', () => {
    const usage = { operation: 'image', provider: 'openai', outputCount: 4 };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('image');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'image', units: 4 });
  });

  it('meters a video per second of output', () => {
    const usage = { operation: 'video', durationSecs: 8 };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('video');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'second', units: 8 });
  });

  it('meters a transcription per minute of audio', () => {
    const usage = { operation: 'transcription', audioSeconds: 90 };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('transcription');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'minute', units: 1.5 });
  });

  it('meters a computer-use turn per request', () => {
    const usage = { quotaFeature: 'computer_use', inputTokens: 10, outputTokens: 5 };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('computer_use');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'request', units: 1 });
  });

  it('falls back to token metering for chat', () => {
    const usage = { inputTokens: 1200, outputTokens: 300 };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('chat');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'token', units: 1500 });
  });
});

describe('cogs ledger · writes', () => {
  it('writes a provider cost event that a settlement retry cannot double count', async () => {
    const db = fakeDb();
    await recordProviderCostEvent(
      {
        userId: 'user-1',
        capability: 'image',
        provider: 'openai',
        model: 'catalog-model',
        unitBasis: 'image',
        units: 2,
        providerCostCents: 12,
        billedCents: 12,
        sourceRef: 'managed_usage:user-1:key:hash',
        taskOutcome: 'delivered',
      },
      db as never,
    );

    const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into public.provider_cost_events');
    expect(sql).toContain('on conflict (source_ref) do nothing');
    expect(params.slice(0, 10)).toEqual([
      'user-1',
      'image',
      'openai',
      'catalog-model',
      'image',
      2,
      12,
      12,
      'managed_usage:user-1:key:hash',
      '{}',
    ]);
  });

  it('keeps the larger amount when a cumulative adjustment is re-imported', async () => {
    const db = fakeDb();
    await recordCogsAdjustment(
      { kind: 'refund', amountCents: 500, sourceRef: 'balance_txn:txn_1' },
      db as never,
    );

    const [sql] = db.execute.mock.calls[0] as unknown as [string];
    expect(sql).toContain('on conflict (kind, source_ref)');
    expect(sql).toContain('greatest(public.cogs_adjustments.amount_cents, excluded.amount_cents)');
  });

  it('never lets a ledger write failure break the settlement it describes', async () => {
    const db = { query: vi.fn(), execute: vi.fn(async () => Promise.reject(new Error('down'))) };

    await expect(
      recordSettledProviderCost({
        userId: 'user-1',
        provider: 'openai',
        model: 'catalog-model',
        actualCostCents: 9,
        sourceRef: 'managed_usage:user-1:key:hash',
        usage: { operation: 'image', outputCount: 1 },
        db: db as never,
      }),
    ).resolves.toBeUndefined();
  });

  it('stores the serving route id in the ledger row metadata when supplied', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'anthropic',
      model: 'served-model',
      routeId: 'open_router/served-model',
      actualCostCents: 9,
      sourceRef: 'managed_usage:user-1:key:hash',
      usage: { inputTokens: 10, outputTokens: 5 },
      db: db as never,
    });

    const [, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    const metadata = JSON.parse(String(params[9]));
    expect(metadata).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      servedRouteId: 'open_router/served-model',
    });
    expect(getServedRouteIdFromCostEventMetadata(metadata)).toBe('open_router/served-model');
  });

  it('leaves ledger metadata untouched when no route id is supplied', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'openai',
      model: 'catalog-model',
      actualCostCents: 9,
      sourceRef: 'managed_usage:user-1:key:hash',
      usage: { operation: 'image', outputCount: 1 },
      db: db as never,
    });

    const [, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    const metadata = JSON.parse(String(params[9]));
    expect(metadata).toEqual({ operation: 'image', outputCount: 1 });
    expect(getServedRouteIdFromCostEventMetadata(metadata)).toBeNull();
  });

  it('reads null back for metadata with no served route facts', () => {
    expect(getServedRouteIdFromCostEventMetadata({})).toBeNull();
    expect(getServedRouteIdFromCostEventMetadata(null)).toBeNull();
    expect(getServedRouteIdFromCostEventMetadata(undefined)).toBeNull();
  });
});

describe('cogs ledger · retail-equivalent cost and value multiplier', () => {
  it('prices token-capability usage at the canonical creator-direct rate', () => {
    expect(
      resolveRetailCostCents({
        capability: 'chat',
        provider: 'openai',
        model: 'not-a-real-catalog-model',
        usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      }),
    ).toBe(200);
  });

  it('is null for non-token capabilities and for an unknown model', () => {
    expect(
      resolveRetailCostCents({
        capability: 'image',
        provider: 'openai',
        model: 'not-a-real-catalog-model',
        usage: { operation: 'image', outputCount: 2 },
      }),
    ).toBeNull();
    expect(
      resolveRetailCostCents({
        capability: 'chat',
        provider: 'openai',
        model: null,
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    ).toBeNull();
  });

  it('stores retail cost in the ledger metadata and reports the value multiplier', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'openai',
      model: 'not-a-real-catalog-model',
      actualCostCents: 100,
      sourceRef: 'managed_usage:user-1:key:retail',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      db: db as never,
    });

    const [, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    const metadata = JSON.parse(String(params[9]));
    expect(metadata.retailCostCents).toBe(200);
    expect(getValueMultiplierFromCostEvent({ metadata, actualCostCents: 100 })).toBe(2);
  });

  it('returns null for a value multiplier with no retail figure or zero actual cost', () => {
    expect(getValueMultiplierFromCostEvent({ metadata: {}, actualCostCents: 100 })).toBeNull();
    expect(
      getValueMultiplierFromCostEvent({ metadata: { retailCostCents: 200 }, actualCostCents: 0 }),
    ).toBeNull();
  });
});

describe('cogs ledger · retail matches the actual cost path in the same units', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');
  const DEFAULT_ROUTE = `openai/${FIXTURE_RETAIL_MODEL}`;
  const CHEAP_ROUTE = `open_router/${FIXTURE_RETAIL_MODEL}`;

  afterEach(() => {
    setRouteRegistryPricingLookup(null);
  });

  it('equals the actual cost, in cents, for a single call on the default route', () => {
    const usage = { inputTokens: 100_000, outputTokens: 20_000 };

    const actualCents = LLMCostCalculator.calculateCost(
      'openai',
      FIXTURE_RETAIL_MODEL,
      {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      },
      PRICED_ON,
      DEFAULT_ROUTE,
    );
    const retailCents = resolveRetailCostCents({
      capability: 'chat',
      provider: 'openai',
      model: FIXTURE_RETAIL_MODEL,
      usage,
      pricedAt: PRICED_ON,
    });

    expect(actualCents).toBe(36); // 0.1M * $2 + 0.02M * $8 = $0.36
    expect(retailCents).toBe(actualCents);
  });

  it('exceeds the actual cost when the serving route is cheaper than the list price', () => {
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) =>
        routeId === CHEAP_ROUTE
          ? {
              provider: 'open_router',
              isDefault: false,
              inputPerMillion: 1,
              outputPerMillion: 4,
              cacheReadPerMillion: null,
              cacheWritePerMillion: null,
              cacheWrite1hPerMillion: null,
            }
          : null,
    });
    const usage = { inputTokens: 100_000, outputTokens: 20_000 };

    const actualCents = LLMCostCalculator.calculateCost(
      'open_router',
      FIXTURE_RETAIL_MODEL,
      {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      },
      PRICED_ON,
      CHEAP_ROUTE,
    );
    const retailCents = resolveRetailCostCents({
      capability: 'chat',
      provider: 'open_router',
      model: FIXTURE_RETAIL_MODEL,
      usage,
      pricedAt: PRICED_ON,
    });

    expect(actualCents).toBe(18); // 0.1M * $1 + 0.02M * $4 = $0.18, ungated by the route
    expect(retailCents).toBe(36); // still the $2/$8 list price
    expect(retailCents).toBeGreaterThan(actualCents);
  });

  it('sums per call, matching an agentic turn priced observation by observation', () => {
    const usage = createObservedProviderUsage();
    for (let step = 0; step < 3; step += 1) {
      accumulateObservedProviderUsage(
        usage,
        {
          inputTokens: 20_000,
          outputTokens: 4_000,
          cacheWriteTokens: 6_000,
          cacheWrite1hTokens: 5_000,
        },
        { provider: 'openai', model: FIXTURE_RETAIL_MODEL, routeId: DEFAULT_ROUTE },
      );
    }

    const actualCents = observedProviderUsageLedgerCents(usage, {
      provider: 'openai',
      model: FIXTURE_RETAIL_MODEL,
      routeId: DEFAULT_ROUTE,
    });
    const retailCents = resolveRetailCostCents({
      capability: 'chat',
      provider: 'openai',
      model: FIXTURE_RETAIL_MODEL,
      usage: { ...usage },
      pricedAt: PRICED_ON,
    });

    expect(retailCents).toBe(actualCents);
  });
});

describe('cogs ledger · stripe settlement import', () => {
  function stripeWith(entries: unknown[], invoices: unknown[] = []) {
    return {
      balanceTransactions: {
        list: vi.fn(() => ({
          autoPagingEach: async (handler: (entry: unknown) => void) => {
            for (const entry of entries) handler(entry);
          },
        })),
      },
      invoices: {
        list: vi.fn(() => ({
          autoPagingEach: async (handler: (entry: unknown) => void) => {
            for (const invoice of invoices) handler(invoice);
          },
        })),
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports processing fees, refunds and chargebacks from the authoritative source', async () => {
    const db = fakeDb();
    const stripe = stripeWith([
      {
        id: 'txn_fee',
        amount: 2000,
        fee: 88,
        currency: 'usd',
        created: 1_780_000_000,
        type: 'charge',
      },
      {
        id: 'txn_refund',
        amount: -1500,
        fee: 0,
        currency: 'usd',
        created: 1_780_000_100,
        type: 'refund',
      },
      {
        id: 'txn_dispute',
        amount: -2500,
        fee: 1500,
        currency: 'usd',
        created: 1_780_000_200,
        type: 'adjustment',
      },
    ]);

    const summary = await importStripeCogsAdjustments({
      stripe: stripe as never,
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-06-04T00:00:00Z'),
      db: db as never,
    });

    expect(summary.examined).toBe(3);
    expect(summary.feesRecorded).toBe(2);
    expect(summary.adjustmentsRecorded).toBe(2);

    const kinds = db.execute.mock.calls.map(
      (call) => (call as unknown as [string, unknown[]])[1][1],
    );
    expect(kinds).toContain('stripe_fee');
    expect(kinds).toContain('refund');
    expect(kinds).toContain('chargeback');
  });

  it('records every invoice discount as a margin deduction', async () => {
    const db = fakeDb();
    const stripe = stripeWith(
      [],
      [
        {
          id: 'in_discounted',
          currency: 'usd',
          created: 1_780_000_300,
          total_discount_amounts: [
            { amount: 400, discount: 'di_launch' },
            { amount: 100, discount: { id: 'di_loyalty' } },
          ],
        },
        {
          id: 'in_full_price',
          currency: 'usd',
          created: 1_780_000_400,
          total_discount_amounts: [],
        },
      ],
    );

    const summary = await importStripeCogsAdjustments({
      stripe: stripe as never,
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-06-04T00:00:00Z'),
      db: db as never,
    });

    expect(summary.discountsRecorded).toBe(1);

    const writes = db.execute.mock.calls.map((call) => (call as unknown as [string, unknown[]])[1]);
    const discountWrite = writes.find((params) => params[1] === 'discount');
    expect(discountWrite).toBeDefined();
    expect(discountWrite?.[2]).toBe(500);
    expect(discountWrite?.[4]).toBe('invoice:in_discounted');
    expect(writes.filter((params) => params[1] === 'discount')).toHaveLength(1);
  });

  it('asks Stripe only for the requested window', async () => {
    const stripe = stripeWith([]);
    await importStripeCogsAdjustments({
      stripe: stripe as never,
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-06-04T00:00:00Z'),
      db: fakeDb() as never,
    });

    expect(stripe.balanceTransactions.list).toHaveBeenCalledWith({
      created: {
        gte: Math.floor(Date.UTC(2026, 5, 1) / 1000),
        lt: Math.floor(Date.UTC(2026, 5, 4) / 1000),
      },
      limit: 100,
    });
  });
});

describe('cogs ledger · aggregation', () => {
  it('reads one summary covering provider spend and every margin deduction', async () => {
    const db = fakeDb([
      {
        provider_cost_cents: '1000',
        billed_cents: '1500',
        stripe_fee_cents: '60',
        refund_cents: '100',
        chargeback_cents: '50',
        chargeback_reserve_cents: '25',
        discount_cents: '10',
        support_adjustment_cents: '5',
        tax_cents: '0',
        gross_margin_cents: '250',
      },
    ]);

    const summary = await summarizeCogs(
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
      db as never,
    );

    expect(db.query).toHaveBeenCalledWith('select * from public.cogs_summary($1, $2)', [
      '2026-06-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);
    expect(summary).toMatchObject({
      providerCostCents: 1000,
      billedCents: 1500,
      stripeFeeCents: 60,
      refundCents: 100,
      chargebackCents: 50,
      chargebackReserveCents: 25,
      discountCents: 10,
      supportAdjustmentCents: 5,
      taxCents: 0,
      grossMarginCents: 250,
    });
  });
});
