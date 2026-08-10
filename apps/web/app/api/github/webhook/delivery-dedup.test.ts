import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { recordDeliveryOnce, type DeliveryDedupDb } from './delivery-dedup';

function fakeDb(): DeliveryDedupDb & { inserted: string[] } {
  const seen = new Set<string>();
  const inserted: string[] = [];
  return {
    inserted,
    query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      expect(sql).toContain('on conflict (delivery_id) do nothing');
      const deliveryId = params[0] as string;
      if (seen.has(deliveryId)) return Promise.resolve([] as T[]);
      seen.add(deliveryId);
      inserted.push(deliveryId);
      return Promise.resolve([{ id: 'row-1' }] as T[]);
    },
  };
}

const descriptor = {
  deliveryId: 'delivery-uuid-1',
  event: 'issue_comment',
  action: 'created',
  installationId: 42,
};

describe('recordDeliveryOnce', () => {
  it('returns first for a new delivery and duplicate for its replay', async () => {
    const db = fakeDb();
    expect(await recordDeliveryOnce(db, descriptor)).toBe('first');
    expect(await recordDeliveryOnce(db, descriptor)).toBe('duplicate');
    expect(db.inserted).toEqual(['delivery-uuid-1']);
  });

  it('treats distinct delivery ids independently', async () => {
    const db = fakeDb();
    expect(await recordDeliveryOnce(db, descriptor)).toBe('first');
    expect(await recordDeliveryOnce(db, { ...descriptor, deliveryId: 'delivery-uuid-2' })).toBe(
      'first',
    );
  });

  it('is unavailable (fail open) for missing, blank, and oversized delivery ids', async () => {
    const db = fakeDb();
    expect(await recordDeliveryOnce(db, { ...descriptor, deliveryId: null })).toBe('unavailable');
    expect(await recordDeliveryOnce(db, { ...descriptor, deliveryId: '   ' })).toBe('unavailable');
    expect(await recordDeliveryOnce(db, { ...descriptor, deliveryId: 'x'.repeat(129) })).toBe(
      'unavailable',
    );
    expect(db.inserted).toEqual([]);
  });

  it('is unavailable (fail open) when the database errors instead of dropping the webhook', async () => {
    const db: DeliveryDedupDb = {
      query: () => Promise.reject(new Error('neon unavailable')),
    };
    expect(await recordDeliveryOnce(db, descriptor)).toBe('unavailable');
  });

  it('bounds attacker-controlled event and action strings before persisting', async () => {
    let captured: unknown[] = [];
    const db: DeliveryDedupDb = {
      query<T>(_sql: string, params: unknown[] = []): Promise<T[]> {
        captured = params;
        return Promise.resolve([{ id: 'row-1' }] as T[]);
      },
    };
    await recordDeliveryOnce(db, {
      deliveryId: 'ok',
      event: 'e'.repeat(500),
      action: 'a'.repeat(500),
      installationId: null,
    });
    expect((captured[1] as string).length).toBe(64);
    expect((captured[2] as string).length).toBe(64);
  });
});
