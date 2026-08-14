import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  MANAGED_CHAT_CONTRACT_VERSION,
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
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
        // Overage headroom. 0 because this fixture has no `overage_enabled`
        // account, which is exactly the default: an account that has not opted
        // in is metered against its plan caps alone, as before 0118.
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
