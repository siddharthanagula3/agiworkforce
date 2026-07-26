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

describe('managed usage Sonnet 5 standard pricing', () => {
  const MODEL = 'claude-sonnet-5';
  const BEFORE_RETIRED_PROMO_CUTOFF = new Date('2026-08-30T23:59:59.999Z');
  const RETIRED_PROMO_CUTOFF = new Date('2026-08-31T00:00:00.000Z');
  const AFTER_RETIRED_PROMO_CUTOFF = new Date('2026-09-01T00:00:00.000Z');

  it('bills standard input and cached-input rates at every date', () => {
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 1_000_000, outputTokens: 0 },
        BEFORE_RETIRED_PROMO_CUTOFF,
      ),
    ).toBe(300);
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
        BEFORE_RETIRED_PROMO_CUTOFF,
      ),
    ).toBe(30);
  });

  it('keeps standard rates at the retired promotional cutoff instant', () => {
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 1_000_000, outputTokens: 0 },
        RETIRED_PROMO_CUTOFF,
      ),
    ).toBe(300);
    expect(
      calculateManagedUsageCostCents(
        MODEL,
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
        RETIRED_PROMO_CUTOFF,
      ),
    ).toBe(30);
  });

  it('bills mixed usage at standard rates on both sides of the retired boundary', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    };

    expect(calculateManagedUsageCostCents(MODEL, usage, BEFORE_RETIRED_PROMO_CUTOFF)).toBe(2205);
    expect(calculateManagedUsageCostCents(MODEL, usage, AFTER_RETIRED_PROMO_CUTOFF)).toBe(2205);
  });

  it('derives the 1h cache-write rate from the standard input rate', () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
      cacheWrite1hTokens: 1_000_000,
    };
    expect(calculateManagedUsageCostCents(MODEL, usage, BEFORE_RETIRED_PROMO_CUTOFF)).toBe(600);
    expect(calculateManagedUsageCostCents(MODEL, usage, AFTER_RETIRED_PROMO_CUTOFF)).toBe(600);
  });

  it('leaves a model with no promo_expires_at unaffected by the date parameter', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    expect(
      calculateManagedUsageCostCents('claude-opus-5', usage, BEFORE_RETIRED_PROMO_CUTOFF),
    ).toBe(calculateManagedUsageCostCents('claude-opus-5', usage, AFTER_RETIRED_PROMO_CUTOFF));
  });

  it('estimates the same standard price regardless of the retired cutoff', () => {
    const body = { model: MODEL, messages: [{ role: 'user', content: 'hi' }] };
    expect(estimateManagedUsageCostCents(body, BEFORE_RETIRED_PROMO_CUTOFF)).toBe(
      estimateManagedUsageCostCents(body, AFTER_RETIRED_PROMO_CUTOFF),
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
      now: AFTER_RETIRED_PROMO_CUTOFF,
    });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_managed_usage_request',
      expect.objectContaining({ p_actual_cost_cents: 300 }),
    );
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
