import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  MANAGED_CHAT_CONTRACT_VERSION,
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
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
      model: 'claude-sonnet-5',
      estimatedCostCents: 7,
      leaseToken: 'lease-1',
    });

    expect(reservation).toMatchObject({
      userId: 'user_1',
      idempotencyKey: 'agi.chat.web.send.turn_12345',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 7,
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('reserve_managed_usage_request'),
      [
        'user_1',
        'agi.chat.web.send.turn_12345',
        'a'.repeat(64),
        'anthropic',
        'claude-sonnet-5',
        7,
        'lease-1',
        900,
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
      model: 'gpt-5.4-mini',
      estimatedCostCents: 7,
      leaseToken: 'lease-2',
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ManagedUsageRequestError);
    expect(error).toMatchObject({ status, code });
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
});
