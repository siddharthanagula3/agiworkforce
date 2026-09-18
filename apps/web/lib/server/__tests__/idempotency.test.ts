import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { fingerprintRequestBody, readIdempotencyKey, withIdempotentWrite } from '../idempotency';

const ORG = '11111111-1111-4111-8111-111111111111';

interface StoredRow {
  status: string;
  request_fingerprint: string;
  response_status: number | null;
  response_body: unknown;
}

function store() {
  const rows = new Map<string, StoredRow>();
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const key = `${params[0]}|${params[1]}|${params[2]}`;
    if (/insert into public\.admin_request_idempotency/i.test(sql)) {
      if (rows.has(key)) return [];
      rows.set(key, {
        status: 'in_progress',
        request_fingerprint: String(params[3]),
        response_status: null,
        response_body: null,
      });
      return [{ organization_id: params[0] }];
    }
    if (/update public\.admin_request_idempotency/i.test(sql)) {
      const row = rows.get(key);
      if (row) {
        row.status = 'completed';
        row.response_status = Number(params[3]);
        row.response_body = JSON.parse(String(params[4]));
      }
      return [];
    }
    if (/delete from public\.admin_request_idempotency/i.test(sql)) {
      if (rows.get(key)?.status === 'in_progress') rows.delete(key);
      return [];
    }
    const row = rows.get(key);
    return row ? [row] : [];
  });
  return { rows, db: { query } as unknown as DatabaseAdapter, query };
}

function scope(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    scope: 'admin-api-keys:create',
    actorId: 'user-1',
    key: 'retry-key-0001',
    requestBody: { name: 'SIEM', scopes: ['audit.read'] },
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('readIdempotencyKey', () => {
  function withHeader(value: string | null): Request {
    return new Request('https://app.test/x', {
      headers: value === null ? {} : { 'Idempotency-Key': value },
    });
  }

  it('returns null when the caller sends no key', () => {
    expect(readIdempotencyKey(withHeader(null))).toBeNull();
  });

  it('accepts a normal key and trims it', () => {
    expect(readIdempotencyKey(withHeader('  abc-123_45:6  '))).toBe('abc-123_45:6');
  });

  it('refuses a key that is too short or carries unusable characters', () => {
    expect(() => readIdempotencyKey(withHeader('short'))).toThrow(/Idempotency-Key must be/);
    expect(() => readIdempotencyKey(withHeader('has spaces here'))).toThrow(
      /Idempotency-Key must be/,
    );
  });
});

describe('fingerprintRequestBody', () => {
  it('is stable across key order so a reordered body is the same request', () => {
    expect(fingerprintRequestBody({ a: 1, b: [2, { c: 3 }] })).toBe(
      fingerprintRequestBody({ b: [2, { c: 3 }], a: 1 }),
    );
  });

  it('differs when a value changes', () => {
    expect(fingerprintRequestBody({ a: 1 })).not.toBe(fingerprintRequestBody({ a: 2 }));
  });
});

describe('withIdempotentWrite', () => {
  it('performs the write once and replays the stored response on a retry', async () => {
    const { db } = store();
    const write = vi.fn(async () => ({
      replayed: false,
      status: 201,
      body: { record: { id: 'key-1' } },
    }));

    const first = await withIdempotentWrite(db, scope(), write);
    const second = await withIdempotentWrite(db, scope(), write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ replayed: false, status: 201, body: { record: { id: 'key-1' } } });
    expect(second).toEqual({ replayed: true, status: 201, body: { record: { id: 'key-1' } } });
  });

  it('refuses a key reused for a different request instead of replaying the wrong answer', async () => {
    const { db } = store();
    const write = vi.fn(async () => ({ replayed: false, status: 201, body: { id: 'a' } }));

    await withIdempotentWrite(db, scope(), write);

    await expect(
      withIdempotentWrite(
        db,
        scope({ requestBody: { name: 'Other', scopes: ['audit.read'] } }),
        write,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('refuses a retry while the first request is still running', async () => {
    const { db, rows } = store();
    rows.set(`${ORG}|admin-api-keys:create|retry-key-0001`, {
      status: 'in_progress',
      request_fingerprint: fingerprintRequestBody(scope().requestBody),
      response_status: null,
      response_body: null,
    });

    await expect(
      withIdempotentWrite(db, scope(), async () => ({ replayed: false, status: 201, body: {} })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('releases the key when the write fails, so the caller can retry the same request', async () => {
    const { db } = store();
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ replayed: false, status: 201, body: { id: 'a' } });

    await expect(withIdempotentWrite(db, scope(), write)).rejects.toThrow('database unavailable');
    const retried = await withIdempotentWrite(db, scope(), write);

    expect(retried).toEqual({ replayed: false, status: 201, body: { id: 'a' } });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('separates keys by workspace and by scope', async () => {
    const { db } = store();
    const write = vi.fn(async () => ({ replayed: false, status: 201, body: { id: 'a' } }));

    await withIdempotentWrite(db, scope(), write);
    await withIdempotentWrite(db, scope({ scope: 'organization-roles:create' }), write);

    expect(write).toHaveBeenCalledTimes(2);
  });
});
