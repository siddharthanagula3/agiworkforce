import { describe, expect, it, vi } from 'vitest';

import { BILLING_PLAN_CAPABILITY_TIERS } from '@agiworkforce/types';

import {
  calculateManagedUsageCostCents,
  estimateManagedUsageCostCents,
  fingerprintManagedUsageRequest,
  finalizeManagedUsage,
  markManagedUsageClientDelivered,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsage,
} from '../../src/services/managedUsageBilling';

/**
 * The catalog lookup is mocked only to ADD a synthetic scheduled model used to
 * prove the dated-window mechanism on arbitrary dates. Every real model still
 * resolves through the real catalog, so the founder pin below stays a pin on
 * shipped data.
 */
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const fixture = {
    id: 'fixture-scheduled-model',
    provider: 'anthropic',
    inputCost: 3,
    outputCost: 15,
    cached_input: 0.3,
    cached_write: 3.75,
    cached_write_1h: 6,
    pricingSchedule: [
      {
        effectiveUntil: '2030-03-31',
        inputCost: 2,
        outputCost: 10,
        cached_input: 0.2,
        cached_write: 2.5,
        cached_write_1h: 4,
      },
      { effectiveFrom: '2030-04-01' },
    ],
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id ? fixture : actual.getModelMetadataById(id),
  };
});

interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function rpcClient(results: RpcResult[]) {
  const rpc = vi.fn(async () => results.shift() ?? { data: null, error: { message: 'missing' } });
  return { client: { rpc }, rpc };
}

const requestBody = {
  model: 'claude-opus-5',
  messages: [{ role: 'user', content: 'Build a release plan' }],
  stream: true,
  max_tokens: 512,
};

describe('managed usage request identity', () => {
  it('requires a bounded retry-stable idempotency key', () => {
    expect(parseManagedUsageIdempotencyKey('  turn_12345678  ')).toBe('turn_12345678');
    expect(() => parseManagedUsageIdempotencyKey(undefined)).toThrowError(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED', statusCode: 400 }),
    );
    expect(() => parseManagedUsageIdempotencyKey('short')).toThrowError(
      expect.objectContaining({ code: 'INVALID_IDEMPOTENCY_KEY', statusCode: 400 }),
    );
    expect(() => parseManagedUsageIdempotencyKey(['one', 'two'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_IDEMPOTENCY_KEY', statusCode: 400 }),
    );
  });

  it('uses canonical JSON so object-key order does not change the request fingerprint', () => {
    const first = fingerprintManagedUsageRequest({
      model: 'claude-opus-5',
      stream: true,
      messages: [{ content: 'hello', role: 'user' }],
    });
    const reordered = fingerprintManagedUsageRequest({
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
      model: 'claude-opus-5',
    });
    const changed = fingerprintManagedUsageRequest({
      messages: [{ role: 'user', content: 'different' }],
      stream: true,
      model: 'claude-opus-5',
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });
});

describe('managed usage registry-driven cost accounting', () => {
  it('estimates from the shared model registry instead of a route allow-list', () => {
    const estimate = estimateManagedUsageCostCents(requestBody);
    expect(estimate).toBeGreaterThanOrEqual(1);
  });

  it('prices cache reads and writes from canonical usage without double-counting input', () => {
    const uncached = calculateManagedUsageCostCents('claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const cached = calculateManagedUsageCostCents('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    const cacheWrite = calculateManagedUsageCostCents('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
    });

    expect(cached).toBeGreaterThan(0);
    expect(cached).toBeLessThan(uncached);
    expect(cacheWrite).toBeGreaterThan(uncached);
  });
});

/**
 * Founder pin — Decision #22 (docs/decisions/CURRENT_DECISIONS.md, reaffirmed
 * 2026-08-05). The managed ledger bills Sonnet 5 at the founder-selected
 * standard $3/$15 per MTok (cache read $0.30, 5m write $3.75, 1h write $6.00)
 * on EVERY date: 300 cents per MTok of input, before and after the retired
 * 2026-09-01 boundary alike. Anthropic's introductory window is a provider-COST
 * fact recorded in the registry's verificationLog, never a product price. The
 * ledger must also resolve the same rate for the same date that apps/web's
 * LLMCostCalculator does, so every case passes a fixed date.
 */
describe('managed usage Sonnet 5 standard pricing', () => {
  const MODEL = 'claude-sonnet-5';
  const BEFORE_RETIRED_BOUNDARY = new Date('2026-08-30T23:59:59.999Z');
  const AT_RETIRED_BOUNDARY = new Date('2026-08-31T00:00:00.000Z');
  const AFTER_RETIRED_BOUNDARY = new Date('2026-09-01T00:00:00.000Z');
  const WELL_AFTER_RETIRED_BOUNDARY = new Date('2026-09-15T00:00:00.000Z');
  const EVERY_DATE = [
    BEFORE_RETIRED_BOUNDARY,
    AT_RETIRED_BOUNDARY,
    AFTER_RETIRED_BOUNDARY,
    WELL_AFTER_RETIRED_BOUNDARY,
    new Date('2020-01-01T00:00:00.000Z'),
  ];

  it('bills 300 cents per MTok of input on every date', () => {
    // Standard: $3/M input, $0.3/M cache read.
    for (const date of EVERY_DATE) {
      expect(
        calculateManagedUsageCostCents(MODEL, { inputTokens: 1_000_000, outputTokens: 0 }, date),
      ).toBe(300);
      expect(
        calculateManagedUsageCostCents(
          MODEL,
          { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
          date,
        ),
      ).toBe(30);
    }
  });

  it('bills mixed usage at standard rates on both sides of the retired boundary', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    };

    // Standard: $3 + $15 + $0.3 + $3.75 = $22.05.
    expect(calculateManagedUsageCostCents(MODEL, usage, BEFORE_RETIRED_BOUNDARY)).toBe(2205);
    expect(calculateManagedUsageCostCents(MODEL, usage, AFTER_RETIRED_BOUNDARY)).toBe(2205);
    expect(calculateManagedUsageCostCents(MODEL, usage, WELL_AFTER_RETIRED_BOUNDARY)).toBe(2205);
  });

  it('bills the 1h cache-write tier at the standard $6/M on every date', () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
      cacheWrite1hTokens: 1_000_000,
    };
    for (const date of EVERY_DATE) {
      expect(calculateManagedUsageCostCents(MODEL, usage, date)).toBe(600);
    }
  });

  it('estimates the same standard price regardless of the retired boundary', () => {
    const body = { model: MODEL, messages: [{ role: 'user', content: 'hi' }] };
    expect(estimateManagedUsageCostCents(body, BEFORE_RETIRED_BOUNDARY)).toBe(
      estimateManagedUsageCostCents(body, AFTER_RETIRED_BOUNDARY),
    );
  });

  it('leaves a model with no dated window unaffected by the date parameter', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    expect(calculateManagedUsageCostCents('claude-opus-5', usage, BEFORE_RETIRED_BOUNDARY)).toBe(
      calculateManagedUsageCostCents('claude-opus-5', usage, AFTER_RETIRED_BOUNDARY),
    );
  });

  it('finalizeManagedUsage sends the standard price to the ledger', async () => {
    const { client, rpc } = rpcClient([
      {
        data: [
          {
            request_status: 'completed',
            operation_result: 'finalized',
            settlement_status: 'succeeded',
            actual_cost_cents: 999, // RPC's own stored figure -- irrelevant to what we send it.
            error_code: null,
          },
        ],
        error: null,
      },
    ]);

    await finalizeManagedUsage({
      client,
      userId: 'user-1',
      idempotencyKey: 'turn_12345678',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
      outcome: 'completed',
      model: MODEL,
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
      now: AFTER_RETIRED_BOUNDARY,
    });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_managed_usage_request',
      expect.objectContaining({ p_actual_cost_cents: 300 }),
    );
  });
});

/**
 * The dated-pricing MECHANISM, proved against the synthetic fixture registered
 * above rather than against any shipped price. `effectiveFrom`/`effectiveUntil`
 * are UTC calendar days, inclusive on both sides; the changeover happens at UTC
 * midnight. Fixed dates sit on both sides of the synthetic boundary.
 */
describe('managed usage dated pricing mechanism (synthetic fixture)', () => {
  const MODEL = 'fixture-scheduled-model';
  const INSIDE_FIRST_WINDOW = new Date('2030-02-15T00:00:00.000Z');
  const LAST_DAY_OF_FIRST_WINDOW = new Date('2030-03-31T23:59:59.999Z');
  const FIRST_DAY_OF_SECOND_WINDOW = new Date('2030-04-01T00:00:00.000Z');

  it('bills the covering window for input and cache reads', () => {
    // First window: $2/M input, $0.2/M cache read.
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 1_000_000, outputTokens: 0 },
        INSIDE_FIRST_WINDOW,
      ),
    ).toBe(200);
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
        INSIDE_FIRST_WINDOW,
      ),
    ).toBe(20);
  });

  it('treats the last day of a window as inclusive and switches on the next UTC day', () => {
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 1_000_000, outputTokens: 0 },
        LAST_DAY_OF_FIRST_WINDOW,
      ),
    ).toBe(200);
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 1_000_000, outputTokens: 0 },
        FIRST_DAY_OF_SECOND_WINDOW,
      ),
    ).toBe(300);
  });

  it('bills mixed usage at the rate window that covers the request date', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    };

    // First window: $2 + $10 + $0.2 + $2.5 = $14.70.
    expect(calculateManagedUsageCostCents(MODEL, usage, INSIDE_FIRST_WINDOW)).toBe(1470);
    // Second window inherits the top-level rates: $3 + $15 + $0.3 + $3.75 = $22.05.
    expect(calculateManagedUsageCostCents(MODEL, usage, FIRST_DAY_OF_SECOND_WINDOW)).toBe(2205);
  });

  it('takes the 1h cache-write rate from the window, not from a fixed 2x multiplier', () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
      cacheWrite1hTokens: 1_000_000,
    };
    expect(calculateManagedUsageCostCents(MODEL, usage, INSIDE_FIRST_WINDOW)).toBe(400);
    expect(calculateManagedUsageCostCents(MODEL, usage, FIRST_DAY_OF_SECOND_WINDOW)).toBe(600);
  });
});

/**
 * OpenAI began charging for prompt-cache WRITES with the GPT-5.6 family (1.25x
 * the uncached input rate). The catalog declares that as `cached_write`, so the
 * ledger bills a write only when a price is published for it.
 */
describe('managed usage OpenAI cache-write billing', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');

  it('bills GPT-5.6 writes at the declared price, each prompt token once', () => {
    // gpt-5.6-terra: $2/M input, $0.2/M read, $2.5/M write. A 1M prompt of
    // 400k reads + 200k writes + 400k plain input = $0.80 + $0.08 + $0.50.
    expect(
      calculateManagedUsageCostCents(
        'gpt-5.6-terra',
        {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 400_000,
          cacheWriteTokens: 200_000,
        },
        PRICED_ON,
      ),
    ).toBe(138);
  });

  it('bills an unpriced cache read at the full input rate', () => {
    // grok-4.5 publishes no cached_input and IS billable here: it is in
    // tierAllowedModels.flagship_additions, which routes/llm.ts turns into
    // FLAGSHIP_ALLOWED_MODELS, and its xAI adapter reuses the OpenAI stream
    // translator, so prompt_tokens_details.cached_tokens reaches this ledger.
    // The full $2/M is charged, matching apps/web's LLMCostCalculator and the
    // desktop calculator; a 90%-off fallback would bill 20 cents for a discount
    // the catalog does not publish.
    expect(
      calculateManagedUsageCostCents(
        'grok-4.5',
        { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 },
        PRICED_ON,
      ),
    ).toBe(200);
  });

  it('keeps writes free for a pre-5.6 OpenAI model that declares no write price', () => {
    const base = { inputTokens: 1_000_000, outputTokens: 0 };
    const withWrites = calculateManagedUsageCostCents(
      'gpt-5.4-mini',
      { ...base, cacheWriteTokens: 1_000_000 },
      PRICED_ON,
    );
    expect(withWrites).toBe(75);
    expect(withWrites).toBe(calculateManagedUsageCostCents('gpt-5.4-mini', base, PRICED_ON));
  });
});

describe('managed usage durable lifecycle client', () => {
  it('reserves through the user-scoped canonical RPC before provider work', async () => {
    const { client, rpc } = rpcClient([
      {
        data: [
          {
            reservation_decision: 'acquired',
            request_status: 'reserved',
            lease_token: 'lease-1',
            estimated_cost_cents: 2,
            settlement_status: 'succeeded',
            error_code: null,
          },
        ],
        error: null,
      },
    ]);

    const reservation = await reserveManagedUsage({
      client,
      userId: 'user-1',
      idempotencyKey: 'turn_12345678',
      provider: 'anthropic',
      request: requestBody,
      planTier: 'pro',
      leaseToken: 'lease-1',
    });

    expect(reservation).toMatchObject({
      idempotencyKey: 'turn_12345678',
      leaseToken: 'lease-1',
      estimatedCostCents: 2,
      requestStatus: 'reserved',
    });
    // `_with_limits`, with the ceilings actually present. The legacy
    // eight-argument function does no rolling accounting at all, so asserting
    // it passed for as long as this path enforced no five-hour, weekly or
    // flagship window on desktop, CLI and VS Code traffic.
    expect(rpc).toHaveBeenCalledWith(
      'reserve_managed_usage_request_with_limits',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_idempotency_key: 'turn_12345678',
        p_provider: 'anthropic',
        p_model: 'claude-opus-5',
        p_lease_token: 'lease-1',
        // Pro: 100 five-hour units and 500 weekly units at two units per cent,
        // flagship weekly at 30% of the weekly ceiling.
        p_session_cap_cents: 50,
        p_weekly_cap_cents: 250,
        p_flagship_weekly_cap_cents: 75,
        p_is_flagship: true,
      }),
    );
  });

  /**
   * Every tier the billing catalog admits to managed compute, with the
   * ceilings `apps/web/lib/server/managed-usage-policy.ts` resolves for it.
   * The gateway mirrors that table by hand because the canonical module is
   * `server-only` and lives in the Next app, so the pin below — every admitted
   * tier must appear here — is what turns a tenth tier added to
   * `billing-catalog.ts` into a red gateway suite instead of a silent cap of 0,
   * i.e. an unconditional 429 for a paying customer on desktop, CLI and VS Code.
   */
  const EXPECTED_TIER_CAP_CENTS: Record<
    string,
    [session: number | null, weekly: number | null, flagshipWeekly: number | null]
  > = {
    // Free is metered in the micro-USD trial ledger, so its PAID ceiling is 0.
    free: [0, 0, 0],
    basic: [10, 50, 15],
    pro: [50, 250, 75],
    max: [250, 1_250, 375],
    max_15x: [750, 3_750, 1_125],
    team: [50, 250, 75],
    // A tier that declares no ceiling passes null, which migration 0070 reads
    // as uncapped; every other tier passes a number, and 0 denies.
    enterprise: [null, null, null],
  };

  it('prices every plan tier admitted to managed compute', () => {
    const admitted = new Set([
      ...BILLING_PLAN_CAPABILITY_TIERS.managed_chat,
      ...BILLING_PLAN_CAPABILITY_TIERS.developer_surfaces,
    ]);
    expect([...admitted].sort()).toEqual(Object.keys(EXPECTED_TIER_CAP_CENTS).sort());
  });

  it.each([
    ...Object.entries(EXPECTED_TIER_CAP_CENTS).map(
      ([tier, [session, weekly, flagship]]) => [tier, session, weekly, flagship] as const,
    ),
    // An unrecognised tier must fail closed rather than reserve uncapped.
    ['not-a-plan', 0, 0, 0] as const,
  ])(
    'resolves the %s rolling ceilings from the plan, not from the request',
    async (planTier, session, weekly, flagship) => {
      const { client, rpc } = rpcClient([
        {
          data: [
            {
              reservation_decision: 'acquired',
              request_status: 'reserved',
              lease_token: 'lease-1',
              estimated_cost_cents: 2,
              settlement_status: 'succeeded',
              error_code: null,
            },
          ],
          error: null,
        },
      ]);

      await reserveManagedUsage({
        client,
        userId: 'user-1',
        idempotencyKey: 'turn_12345678',
        provider: 'anthropic',
        request: requestBody,
        planTier: planTier as string,
        leaseToken: 'lease-1',
      });

      expect(rpc).toHaveBeenCalledWith(
        'reserve_managed_usage_request_with_limits',
        expect.objectContaining({
          p_session_cap_cents: session,
          p_weekly_cap_cents: weekly,
          p_flagship_weekly_cap_cents: flagship,
        }),
      );
    },
  );

  it('tags only flagship-slot models against the flagship weekly window', async () => {
    const results = [0, 1].map(() => ({
      data: [
        {
          reservation_decision: 'acquired',
          request_status: 'reserved',
          lease_token: 'lease-1',
          estimated_cost_cents: 2,
          settlement_status: 'succeeded',
          error_code: null,
        },
      ],
      error: null,
    }));
    const { client, rpc } = rpcClient(results);

    for (const model of ['claude-opus-5', 'claude-sonnet-5']) {
      await reserveManagedUsage({
        client,
        userId: 'user-1',
        idempotencyKey: 'turn_12345678',
        provider: 'anthropic',
        request: { ...requestBody, model },
        planTier: 'pro',
        leaseToken: 'lease-1',
      });
    }

    // The registry lists `claude-opus-5` under `flagship_coding` before
    // `flagship_coding_pro_plus`, so a first-slot lookup would tag nothing and
    // the flagship ceiling would never bind.
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'reserve_managed_usage_request_with_limits',
      expect.objectContaining({ p_is_flagship: true }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'reserve_managed_usage_request_with_limits',
      expect.objectContaining({ p_is_flagship: false }),
    );
  });

  it.each([
    ['in_progress', 'IDEMPOTENCY_IN_PROGRESS', 409],
    ['completed', 'IDEMPOTENCY_REPLAY', 409],
    ['released', 'IDEMPOTENCY_REPLAY', 409],
    ['outcome_unknown', 'IDEMPOTENCY_REPLAY', 409],
    ['conflict', 'IDEMPOTENCY_CONFLICT', 409],
    ['declined', 'INSUFFICIENT_CREDITS', 402],
    ['session_limit', 'ROLLING_FIVE_HOUR_LIMIT_REACHED', 429],
    ['weekly_limit', 'ROLLING_WEEKLY_LIMIT_REACHED', 429],
    ['flagship_weekly_limit', 'FLAGSHIP_WEEKLY_LIMIT_REACHED', 429],
    ['unavailable', 'BILLING_UNAVAILABLE', 503],
  ])(
    'maps %s reservation decisions to a non-disclosing route error',
    async (decision, code, status) => {
      const { client } = rpcClient([
        {
          data: [
            {
              reservation_decision: decision,
              request_status: decision,
              lease_token: null,
              estimated_cost_cents: 1,
              settlement_status: null,
              error_code: null,
            },
          ],
          error: null,
        },
      ]);

      await expect(
        reserveManagedUsage({
          client,
          userId: 'user-1',
          idempotencyKey: 'turn_12345678',
          provider: 'anthropic',
          request: requestBody,
          planTier: 'pro',
          leaseToken: 'lease-1',
        }),
      ).rejects.toMatchObject({ code, statusCode: status });
    },
  );

  it('fails closed when the reservation record cannot be durably persisted', async () => {
    const { client } = rpcClient([
      { data: null, error: { message: 'connection terminated', code: '08006' } },
    ]);

    await expect(
      reserveManagedUsage({
        client,
        userId: 'user-1',
        idempotencyKey: 'turn_12345678',
        provider: 'anthropic',
        request: requestBody,
        planTier: 'pro',
        leaseToken: 'lease-1',
      }),
    ).rejects.toMatchObject({ code: 'BILLING_UNAVAILABLE', statusCode: 503 });
  });

  it('persists start, success settlement, and client delivery as separate durable phases', async () => {
    const { client, rpc } = rpcClient([
      {
        data: [{ request_status: 'provider_started', operation_result: 'updated' }],
        error: null,
      },
      {
        data: [
          {
            request_status: 'completed',
            operation_result: 'finalized',
            settlement_status: 'succeeded',
            actual_cost_cents: 3,
            error_code: null,
          },
        ],
        error: null,
      },
      {
        data: [{ request_status: 'completed', operation_result: 'updated' }],
        error: null,
      },
    ]);
    const identity = {
      client,
      userId: 'user-1',
      idempotencyKey: 'turn_12345678',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
    };

    await markManagedUsageProviderStarted(identity);
    const result = await finalizeManagedUsage({
      ...identity,
      outcome: 'completed',
      model: 'claude-opus-5',
      usage: { inputTokens: 100_000, outputTokens: 20_000 },
    });
    await markManagedUsageClientDelivered(identity);

    expect(result).toMatchObject({ requestStatus: 'completed', operationResult: 'finalized' });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'mark_managed_usage_provider_started',
      'finalize_managed_usage_request',
      'mark_managed_usage_client_delivered',
    ]);
    expect(rpc.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        p_outcome: 'completed',
        p_actual_cost_cents: expect.any(Number),
        p_usage: expect.objectContaining({ inputTokens: 100_000, outputTokens: 20_000 }),
      }),
    );
  });

  it('uses the same terminal function for provider failure and does not invent actual usage', async () => {
    const { client, rpc } = rpcClient([
      {
        data: [
          {
            request_status: 'released',
            operation_result: 'finalized',
            settlement_status: 'succeeded',
            actual_cost_cents: 0,
            error_code: null,
          },
        ],
        error: null,
      },
    ]);

    await finalizeManagedUsage({
      client,
      userId: 'user-1',
      idempotencyKey: 'turn_12345678',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
      outcome: 'failed',
      model: 'claude-opus-5',
    });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_managed_usage_request',
      expect.objectContaining({ p_outcome: 'failed', p_actual_cost_cents: 0, p_usage: {} }),
    );
  });
});
