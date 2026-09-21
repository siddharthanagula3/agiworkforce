import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { managedUsageIdempotencyKey } = await import('../managed-usage-idempotency');
const { ManagedUsageRequestError, parseManagedUsageIdempotencyKey } =
  await import('../managed-usage-request-service');

const namespace = 'agi.test.work';

describe('managedUsageIdempotencyKey', () => {
  it('gives one unit of work one key however often it is derived', () => {
    const identity = { conversationId: 'conv-1', offer: 'v=0' };

    expect(managedUsageIdempotencyKey({ namespace, identity })).toBe(
      managedUsageIdempotencyKey({ namespace, identity: { ...identity } }),
    );
  });

  it('ignores the order the identity was written in', () => {
    expect(managedUsageIdempotencyKey({ namespace, identity: { a: 1, b: 2 } })).toBe(
      managedUsageIdempotencyKey({ namespace, identity: { b: 2, a: 1 } }),
    );
  });

  it('gives two units of work two keys', () => {
    expect(managedUsageIdempotencyKey({ namespace, identity: { offer: 'first' } })).not.toBe(
      managedUsageIdempotencyKey({ namespace, identity: { offer: 'second' } }),
    );
  });

  it('keeps two surfaces apart when they derive the same identity', () => {
    const identity = { turn: 'turn-1' };

    expect(managedUsageIdempotencyKey({ namespace: 'agi.voice.live', identity })).not.toBe(
      managedUsageIdempotencyKey({ namespace: 'memory-extraction', identity }),
    );
  });

  it('takes the client at its word over anything derived from the body', () => {
    const supplied = 'client-key-0001';

    expect(
      managedUsageIdempotencyKey({ namespace, suppliedKey: supplied, identity: { a: 1 } }),
    ).toBe(managedUsageIdempotencyKey({ namespace, suppliedKey: supplied, identity: { a: 2 } }));
  });

  it('refuses a client key the ledger would refuse', () => {
    expect(() =>
      managedUsageIdempotencyKey({ namespace, suppliedKey: 'short', identity: {} }),
    ).toThrow(ManagedUsageRequestError);
  });

  it('builds a key the ledger accepts however long the identity is', () => {
    const key = managedUsageIdempotencyKey({
      namespace: 'agi.voice.live',
      identity: { offer: 'v=0\r\n'.repeat(4_000), conversationId: 'c'.repeat(300) },
    });

    expect(() => parseManagedUsageIdempotencyKey(key)).not.toThrow();
    expect(key.length).toBeLessThanOrEqual(128);
  });
});
