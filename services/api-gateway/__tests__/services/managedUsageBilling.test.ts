import { describe, expect, it, vi } from 'vitest';

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
      leaseToken: 'lease-1',
    });

    expect(reservation).toMatchObject({
      idempotencyKey: 'turn_12345678',
      leaseToken: 'lease-1',
      estimatedCostCents: 2,
      requestStatus: 'reserved',
    });
    expect(rpc).toHaveBeenCalledWith(
      'reserve_managed_usage_request',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_idempotency_key: 'turn_12345678',
        p_provider: 'anthropic',
        p_model: 'claude-opus-5',
        p_lease_token: 'lease-1',
      }),
    );
  });

  it.each([
    ['in_progress', 'IDEMPOTENCY_IN_PROGRESS', 409],
    ['completed', 'IDEMPOTENCY_REPLAY', 409],
    ['released', 'IDEMPOTENCY_REPLAY', 409],
    ['outcome_unknown', 'IDEMPOTENCY_REPLAY', 409],
    ['conflict', 'IDEMPOTENCY_CONFLICT', 409],
    ['declined', 'INSUFFICIENT_CREDITS', 402],
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
