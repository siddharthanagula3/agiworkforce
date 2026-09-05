import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { BLOCK_APPEAL_PATH } from '@/lib/security-audit';

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCost(...args),
}));

import {
  MANAGED_CHAT_CONTRACT_VERSION,
  ManagedUsageRequestError,
  TOP_UP_HREF,
  UPGRADE_HREF,
  USAGE_HREF,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  getServedRouteFromUsage,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
  resolveManagedQuotaRecovery,
} from './managed-usage-request-service';

function fakeDb(rows: Record<string, unknown>[]): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue(rows),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

describe('managed usage request service', () => {
  it('serializes one shared public error envelope while callers choose the error type', () => {
    const error = new ManagedUsageRequestError(
      'Wait for usage to leave the window.',
      429,
      'rolling_weekly_limit_reached',
    );

    expect(createManagedUsageErrorBody(error, 'insufficient_quota')).toEqual({
      error: {
        message: 'Wait for usage to leave the window.',
        type: 'insufficient_quota',
        code: 'rolling_weekly_limit_reached',
        contract_version: MANAGED_CHAT_CONTRACT_VERSION,
      },
    });
  });

  it('publishes a versioned error contract for missing legacy keys', () => {
    expect(MANAGED_CHAT_CONTRACT_VERSION).toBe('2026-07-15');
    expect(() => parseManagedUsageIdempotencyKey(null)).toThrowError(
      expect.objectContaining({
        code: 'idempotency_key_required',
        status: 400,
        contractVersion: '2026-07-15',
      }),
    );
  });

  it('rejects malformed keys and accepts retry-safe external caller keys', () => {
    expect(() => parseManagedUsageIdempotencyKey('bad key')).toThrowError(
      expect.objectContaining({ code: 'invalid_idempotency_key', status: 400 }),
    );
    expect(parseManagedUsageIdempotencyKey('external-client:turn_123')).toBe(
      'external-client:turn_123',
    );
  });

  it('fingerprints canonical JSON independently of object key order', () => {
    const left = fingerprintManagedUsageRequest({ stream: true, model: 'm', messages: [] });
    const right = fingerprintManagedUsageRequest({ messages: [], model: 'm', stream: true });
    expect(left).toBe(right);
    expect(left).toBe(
      createHash('sha256')
        .update(JSON.stringify({ messages: [], model: 'm', stream: true }))
        .digest('hex'),
    );
  });

  it('reserves through the RLS-bound lifecycle and retains its lease identity', async () => {
    const db = fakeDb([
      {
        reservation_decision: 'acquired',
        request_status: 'reserved',
        lease_token: 'lease-1',
        estimated_cost_cents: 7,
        settlement_status: 'succeeded',
        error_code: null,
      },
    ]);

    const reservation = await reserveManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.send.turn_12345',
      requestHash: 'a'.repeat(64),
      provider: 'anthropic',
      model: 'fixture-model',
      estimatedCostCents: 7,
      leaseToken: 'lease-1',
      planTier: 'pro',
      isFlagship: true,
    });

    expect(reservation).toMatchObject({
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.send.turn_12345',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 7,
      routeId: 'anthropic/fixture-model',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('reserve_managed_usage_request_with_limits'),
      [
        'user_1',
        'agi.chat.web.send.turn_12345',
        'a'.repeat(64),
        'anthropic',
        'fixture-model',
        7,
        'lease-1',
        900,
        50,
        250,
        75,
        true,
        0,
      ],
    );
  });

  it.each([
    ['in_progress', 409, 'idempotency_in_progress'],
    ['completed', 409, 'idempotency_replay'],
    ['conflict', 409, 'idempotency_conflict'],
    ['declined', 402, 'insufficient_credits'],
  ] as const)('maps %s reservations to an explicit API error', async (decision, status, code) => {
    const db = fakeDb([
      {
        reservation_decision: decision,
        request_status: decision,
        lease_token: null,
        estimated_cost_cents: 7,
      },
    ]);

    const error = await reserveManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'b'.repeat(64),
      provider: 'openai',
      model: 'fixture-model',
      estimatedCostCents: 7,
      leaseToken: 'lease-2',
      planTier: 'pro',
      isFlagship: false,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ManagedUsageRequestError);
    expect(error).toMatchObject({ status, code });
  });

  it.each([
    ['session_limit', 'rolling_five_hour_limit_reached'],
    ['weekly_limit', 'rolling_weekly_limit_reached'],
    ['flagship_weekly_limit', 'flagship_weekly_limit_reached'],
  ] as const)('maps %s to a fail-closed rolling-cap error', async (decision, code) => {
    const db = fakeDb([
      {
        reservation_decision: decision,
        request_status: 'declined',
        lease_token: null,
        estimated_cost_cents: 7,
      },
    ]);

    const error = await reserveManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'd'.repeat(64),
      provider: 'openai',
      model: 'fixture-model',
      estimatedCostCents: 7,
      leaseToken: 'lease-4',
      planTier: 'pro',
      isFlagship: decision === 'flagship_weekly_limit',
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ManagedUsageRequestError);
    expect(error).toMatchObject({ status: 429, code });
  });

  it('logs the database failure it hides behind the billing-unavailable envelope', async () => {
    const failure = Object.assign(
      new Error('permission denied for function reserve_managed_usage'),
      {
        code: '42501',
      },
    );
    const db = fakeDb([]);
    (db.query as ReturnType<typeof vi.fn>).mockRejectedValue(failure);

    await expect(
      reserveManagedUsageRequest({
        db,
        userId: 'user_1',
        idempotencyKey: 'agi.chat.web.send.turn_12345',
        requestHash: 'a'.repeat(64),
        provider: 'anthropic',
        model: 'fixture-model',
        estimatedCostCents: 7,
        planTier: 'pro',
        isFlagship: true,
      }),
    ).rejects.toMatchObject({ status: 503, code: 'billing_unavailable' });

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ error: failure, code: '42501', statement: expect.any(String) }),
      expect.stringContaining('usage query failed'),
    );
  });

  it('marks provider start and finalizes actual usage with the same identity', async () => {
    const db = fakeDb([]);
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ request_status: 'provider_started', operation_result: 'updated' }])
      .mockResolvedValueOnce([
        {
          request_status: 'completed',
          operation_result: 'finalized',
          settlement_status: 'succeeded',
          actual_cost_cents: 5,
        },
      ]);
    const reservation = {
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'c'.repeat(64),
      leaseToken: 'lease-3',
      estimatedCostCents: 7,
    };

    await markManagedUsageProviderStarted(reservation);
    const final = await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostCents: 5,
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    expect(final).toMatchObject({ requestStatus: 'completed', actualCostCents: 5 });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('finalize_managed_usage_request'),
      [
        'user_1',
        'external-client:turn_123',
        'c'.repeat(64),
        'lease-3',
        'completed',
        5,
        JSON.stringify({ inputTokens: 10, outputTokens: 5 }),
      ],
    );
  });

  it('carries the reserved quota feature into the settled usage row so unit caps can count it', async () => {
    const db = fakeDb([]);
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ headroom_cents: 0 }])
      .mockResolvedValueOnce([
        {
          reservation_decision: 'acquired',
          request_status: 'reserved',
          lease_token: 'lease-9',
          estimated_cost_cents: 7,
          settlement_status: 'succeeded',
          error_code: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          request_status: 'completed',
          operation_result: 'finalized',
          settlement_status: 'succeeded',
          actual_cost_cents: 5,
        },
      ]);

    const reservation = await reserveManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'd'.repeat(64),
      provider: 'fixture-provider',
      model: 'fixture-model',
      estimatedCostCents: 7,
      planTier: 'max',
      isFlagship: false,
      quotaFeature: 'computer_use',
    });

    expect(reservation.quotaFeature).toBe('computer_use');

    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostCents: 5,
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const settledUsage = vi.mocked(db.query).mock.calls[2]?.[1]?.[6];
    expect(JSON.parse(String(settledUsage))).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      quotaFeature: 'computer_use',
    });
  });

  it('atomically extends a provider step with the original request and lease identity', async () => {
    const db = fakeDb([
      {
        extension_decision: 'extended',
        request_status: 'provider_started',
        estimated_cost_cents: 12,
        settlement_status: 'succeeded',
        error_code: null,
      },
    ]);
    const reservation = {
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'e'.repeat(64),
      leaseToken: 'lease-5',
      estimatedCostCents: 7,
    };

    await expect(
      reserveManagedUsageProviderStep({
        reservation,
        operationKey: 'provider:2',
        estimatedCostCents: 5,
        planTier: 'pro',
        isFlagship: true,
      }),
    ).resolves.toEqual({ operationResult: 'extended', estimatedCostCents: 12 });
    expect(reservation.estimatedCostCents).toBe(12);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('extend_managed_usage_request_provider_step'),
      [
        'user_1',
        'external-client:turn_123',
        'e'.repeat(64),
        'lease-5',
        'provider:2',
        5,
        50,
        250,
        75,
        true,
      ],
    );
  });

  it('fails closed when a provider-step extension reaches the weekly cap', async () => {
    const db = fakeDb([
      {
        extension_decision: 'weekly_limit',
        request_status: 'provider_started',
        estimated_cost_cents: 7,
        settlement_status: null,
        error_code: 'ROLLING_WEEKLY_LIMIT_REACHED',
      },
    ]);

    const error = await reserveManagedUsageProviderStep({
      reservation: {
        db,
        userId: 'user_1',
        idempotencyKey: 'external-client:turn_123',
        requestHash: 'f'.repeat(64),
        leaseToken: 'lease-6',
        estimatedCostCents: 7,
      },
      operationKey: 'provider:3',
      estimatedCostCents: 5,
      planTier: 'pro',
      isFlagship: false,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ManagedUsageRequestError);
    expect(error).toMatchObject({ status: 429, code: 'rolling_weekly_limit_reached' });
  });

  it('emits one valid seven-argument finalization function call', async () => {
    const db = fakeDb([
      {
        request_status: 'completed',
        operation_result: 'finalized',
        settlement_status: 'succeeded',
        actual_cost_cents: 5,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'external-client:turn_123',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-7',
      estimatedCostCents: 7,
      outcome: 'completed',
      actualCostCents: 5,
    });

    const sql = vi.mocked(db.query).mock.calls[0]?.[0] ?? '';
    expect(sql.match(/\$1::text/g)).toHaveLength(1);
    expect(sql).toMatch(/\$7::jsonb\s*\)/);
  });
});

describe('managed usage settlement feeds the COGS ledger', () => {
  it('records what the settled capability cost, in that capability’s own unit', async () => {
    recordSettledProviderCost.mockClear();
    const db = fakeDb([
      {
        request_status: 'completed',
        operation_result: 'finalized',
        settlement_status: 'succeeded',
        actual_cost_cents: 14,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.image.web.turn_1',
      requestHash: 'b'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 20,
      provider: 'openai',
      model: 'fixture-image-model',
      quotaFeature: 'image',
      outcome: 'completed',
      actualCostCents: 14,
      usage: { operation: 'image', outputCount: 2 },
    });

    expect(recordSettledProviderCost).toHaveBeenCalledWith({
      userId: 'user_1',
      provider: 'openai',
      model: 'fixture-image-model',
      routeId: 'openai/fixture-image-model',
      actualCostCents: 14,
      sourceRef: `managed_usage:user_1:agi.image.web.turn_1:${'b'.repeat(64)}`,
      taskOutcome: 'delivered',
      taskRef: 'b'.repeat(64),
      usage: { operation: 'image', outputCount: 2, quotaFeature: 'image' },
    });
  });

  it('finalizes a failed-over turn with the serving route, not the reserved one', async () => {
    recordSettledProviderCost.mockClear();
    const db = fakeDb([
      {
        request_status: 'completed',
        operation_result: 'finalized',
        settlement_status: 'succeeded',
        actual_cost_cents: 11,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.turn_failover',
      requestHash: 'e'.repeat(64),
      leaseToken: 'lease-failover',
      estimatedCostCents: 20,
      provider: 'anthropic',
      model: 'reserved-model',
      routeId: 'anthropic/reserved-model',
      outcome: 'completed',
      actualCostCents: 11,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        providerCallObservations: [
          { provider: 'anthropic', model: 'reserved-model', inputTokens: 40, outputTokens: 8 },
          { provider: 'open_router', model: 'served-model', inputTokens: 60, outputTokens: 12 },
        ],
      },
    });

    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'open_router',
        model: 'served-model',
        routeId: 'open_router/served-model',
      }),
    );

    const finalizeCallArgs = vi.mocked(db.query).mock.calls[0]?.[1] as unknown[];
    const finalizedUsage = JSON.parse(String(finalizeCallArgs[6]));
    expect(finalizedUsage).toMatchObject({
      servedProvider: 'open_router',
      servedModel: 'served-model',
      servedRouteId: 'open_router/served-model',
      reservedProvider: 'anthropic',
      reservedModel: 'reserved-model',
      reservedRouteId: 'anthropic/reserved-model',
    });
  });

  it('prefers an explicit observation route id over the raw provider/model reconstruction', async () => {
    recordSettledProviderCost.mockClear();
    const db = fakeDb([
      {
        request_status: 'completed',
        operation_result: 'finalized',
        settlement_status: 'succeeded',
        actual_cost_cents: 7,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.turn_gateway',
      requestHash: 'f'.repeat(64),
      leaseToken: 'lease-gateway',
      estimatedCostCents: 10,
      provider: 'anthropic',
      model: 'served-model',
      routeId: 'anthropic/served-model',
      outcome: 'completed',
      actualCostCents: 7,
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        providerCallObservations: [
          {
            provider: 'openrouter',
            model: 'served-model',
            routeId: 'open_router/served-model',
            inputTokens: 50,
            outputTokens: 10,
          },
        ],
      },
    });

    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openrouter',
        model: 'served-model',
        routeId: 'open_router/served-model',
      }),
    );
  });

  it('records the cost of work the client never confirmed receiving as undelivered', async () => {
    recordSettledProviderCost.mockClear();
    const db = fakeDb([
      {
        request_status: 'outcome_unknown',
        operation_result: 'finalized',
        settlement_status: 'terminal',
        actual_cost_cents: 9,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.turn_9',
      requestHash: 'c'.repeat(64),
      leaseToken: 'lease-9',
      estimatedCostCents: 12,
      provider: 'openai',
      model: 'fixture-chat-model',
      outcome: 'completed',
      actualCostCents: 9,
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({ taskOutcome: 'undelivered', taskRef: 'c'.repeat(64) }),
    );
  });

  it('does not bill the ledger for a released reservation', async () => {
    recordSettledProviderCost.mockClear();
    const db = fakeDb([
      {
        request_status: 'released',
        operation_result: 'finalized',
        settlement_status: null,
        actual_cost_cents: 0,
      },
    ]);

    await finalizeManagedUsageRequest({
      db,
      userId: 'user_1',
      idempotencyKey: 'agi.image.web.turn_2',
      requestHash: 'c'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 20,
      provider: 'openai',
      model: 'fixture-image-model',
      outcome: 'failed',
      actualCostCents: 0,
    });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });
});

describe('getServedRouteFromUsage', () => {
  it('reads served-route facts back from a tagged usage blob', () => {
    expect(
      getServedRouteFromUsage({
        servedProvider: 'open_router',
        servedModel: 'served-model',
        servedRouteId: 'open_router/served-model',
      }),
    ).toEqual({
      provider: 'open_router',
      model: 'served-model',
      routeId: 'open_router/served-model',
    });
  });

  it('returns nulls for a usage blob with no served-route facts', () => {
    expect(getServedRouteFromUsage({ inputTokens: 10 })).toEqual({
      provider: null,
      model: null,
      routeId: null,
    });
    expect(getServedRouteFromUsage(null)).toEqual({ provider: null, model: null, routeId: null });
    expect(getServedRouteFromUsage(undefined)).toEqual({
      provider: null,
      model: null,
      routeId: null,
    });
  });
});

describe('resolveManagedQuotaRecovery', () => {
  it('offers a top-up for a self-serve stripe-billed plan cleared by credits', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'rolling_weekly_limit_reached',
        planTier: 'pro',
        billedByStripe: true,
      }),
    ).toEqual({ action: 'top_up', href: TOP_UP_HREF });
  });

  it('offers an upgrade when the block does not clear by credits but a higher tier exists', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'free_trial_token_budget_reached',
        planTier: 'free',
        billedByStripe: false,
      }),
    ).toEqual({ action: 'upgrade', href: UPGRADE_HREF });
  });

  it('falls back to view usage when there is no upgrade path and no credits path', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'rate_limit_exceeded',
        planTier: 'max_15x',
        billedByStripe: true,
      }),
    ).toEqual({ action: 'view_usage', href: USAGE_HREF });
  });

  it('returns null for a code the catalog does not classify', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'not_a_real_code',
        planTier: 'pro',
        billedByStripe: true,
      }),
    ).toBeNull();
  });

  it('routes an enterprise contract to support instead of a self-serve top-up', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'rolling_weekly_limit_reached',
        planTier: 'enterprise',
        billedByStripe: true,
      }),
    ).toEqual({ action: 'contact_support', href: BLOCK_APPEAL_PATH });
  });

  it('routes an enterprise contract to support even when the block offers no upgrade cta', () => {
    expect(
      resolveManagedQuotaRecovery({
        code: 'rate_limit_exceeded',
        planTier: 'enterprise',
        billedByStripe: false,
      }),
    ).toEqual({ action: 'contact_support', href: BLOCK_APPEAL_PATH });
  });
});
