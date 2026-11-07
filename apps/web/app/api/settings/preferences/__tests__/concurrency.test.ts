import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
  txQuery: vi.fn(),
  transaction: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(),
  events: [] as string[],
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: h.getUserScopedDb,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/request-context-cache')>()),
  invalidateActiveOrganizationCache: h.invalidateActiveOrganizationCache,
}));

import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

const STORED_VERSION = '2026-09-07T10:00:00.000Z';
const NEXT_VERSION = '2026-09-07T10:00:01.000Z';
type Row = { settings: Record<string, unknown>; version: string };
type Step = { operation: 'lock' | 'insert' | 'update'; rows?: unknown[]; error?: Error };

function row(settings: Record<string, unknown> = {}): Row {
  return { settings, version: STORED_VERSION };
}

function script(steps: Step[]) {
  let index = 0;
  h.txQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    const step = steps[index++];
    if (!step) throw new Error(`Unexpected transaction query: ${sql}`);
    expect(params[0]).toBe('user-1');
    if (step.operation === 'lock') {
      expect(sql).toContain('select settings, updated_at::text as version');
      expect(sql).toContain('where user_id = $1 for update');
    } else if (step.operation === 'insert') {
      expect(sql).toContain('insert into public.user_settings');
      expect(sql).toContain('on conflict (user_id) do nothing');
      expect(sql).toContain('returning settings, updated_at::text as version');
    } else {
      expect(sql).toContain('update public.user_settings');
      expect(sql).toContain('settings = user_settings.settings || $2::jsonb');
      expect(sql).toContain('where user_id = $1');
      expect(sql).toContain('returning settings, updated_at::text as version');
    }
    h.events.push(step.operation);
    if (step.error) throw step.error;
    return step.rows ?? [];
  });
  return () => expect(index).toBe(steps.length);
}

function put(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/preferences', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function writtenDelta() {
  const call = h.txQuery.mock.calls.find(([sql]) => /^\s*(insert|update)\b/.test(String(sql)));
  return JSON.parse(String(call?.[1]?.[1])) as Record<string, unknown>;
}

beforeEach(() => {
  vi.resetAllMocks();
  h.events.length = 0;
  h.query.mockImplementation(async () => { throw new Error('Unexpected outer query'); });
  h.txQuery.mockImplementation(async () => { throw new Error('Unscripted transaction query'); });
  h.transaction.mockImplementation(async (callback: (tx: { query: typeof h.txQuery }) => Promise<unknown>) => {
    h.events.push('begin');
    try {
      const result = await callback({ query: h.txQuery });
      h.events.push('commit');
      return result;
    } catch (error) {
      h.events.push('rollback');
      throw error;
    }
  });
  h.invalidateActiveOrganizationCache.mockImplementation(async () => { h.events.push('invalidate'); });
  h.getUserScopedDb.mockResolvedValue({
    db: { query: h.query, transaction: h.transaction }, userId: 'user-1',
  });
});

describe('preferences transaction SQL and modeled interleavings, not a PostgreSQL lock proof', () => {
  it('reads the public revision without opening a write transaction', async () => {
    h.query.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(sql).toContain('updated_at::text as version');
      expect(sql).toContain('where user_id = $1 limit 1');
      expect(params).toEqual(['user-1']);
      return [row({ general: { theme: 'dark' } })];
    });
    const response = await GET(new NextRequest('http://localhost:3000/api/settings/preferences?namespace=general'));
    expect(await response.json()).toEqual({ settings: { theme: 'dark' }, version: STORED_VERSION });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it.each([undefined, null, STORED_VERSION])('locks before merging an existing namespace (%s)', async (expectedVersion) => {
    const stored = { capabilities: { memory: false, searchPastChats: true }, general: { theme: 'dark' } };
    const done = script([
      { operation: 'lock', rows: [row({ ...stored, capabilities: { memory: true, searchPastChats: true } })] },
      { operation: 'update', rows: [{ settings: stored, version: NEXT_VERSION }] },
    ]);
    const response = await PUT(put({ namespace: 'capabilities', patch: { memory: false }, expectedVersion }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: stored, version: NEXT_VERSION });
    expect(writtenDelta()).toEqual({ capabilities: { memory: false, searchPastChats: true } });
    expect(h.events).toEqual(['begin', 'lock', 'update', 'commit']);
    expect(h.query).not.toHaveBeenCalled();
    expect(h.transaction).toHaveBeenCalledTimes(1);
    done();
  });

  it('models a prior sibling write visible when this transaction acquires the row', async () => {
    const done = script([
      { operation: 'lock', rows: [row({ general: { firstWriter: true, secondWriter: false } })] },
      { operation: 'update', rows: [row({ general: { firstWriter: true, secondWriter: true } })] },
    ]);
    expect((await PUT(put({ namespace: 'general', patch: { secondWriter: true } }))).status).toBe(200);
    expect(writtenDelta()).toEqual({ general: { firstWriter: true, secondWriter: true } });
    done();
  });

  it('returns an absent-row insert receipt even with an explicit old version', async () => {
    const receipt = { settings: { general: { theme: 'dark' } }, version: NEXT_VERSION };
    const done = script([{ operation: 'lock' }, { operation: 'insert', rows: [receipt] }]);
    const response = await PUT(put({ namespace: 'general', patch: { theme: 'dark' }, expectedVersion: 'old' }));
    expect(await response.json()).toEqual(receipt);
    expect(h.events).toEqual(['begin', 'lock', 'insert', 'commit']);
    done();
  });

  it('models losing a first insert, then merges the winner under a fresh lock', async () => {
    const done = script([
      { operation: 'lock' }, { operation: 'insert' },
      { operation: 'lock', rows: [row({ general: { winner: true } })] },
      { operation: 'update', rows: [row({ general: { winner: true, loser: true } })] },
    ]);
    expect((await PUT(put({ namespace: 'general', patch: { loser: true } }))).status).toBe(200);
    expect(JSON.parse(String(h.txQuery.mock.calls[3]?.[1]?.[1]))).toEqual({ general: { winner: true, loser: true } });
    expect(h.events).toEqual(['begin', 'lock', 'insert', 'lock', 'update', 'commit']);
    done();
  });

  it('fails without a receipt when the insert winner disappears before the second lock', async () => {
    const done = script([{ operation: 'lock' }, { operation: 'insert' }, { operation: 'lock' }]);
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null } }));
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('settings');
    expect(h.events).toEqual(['begin', 'lock', 'insert', 'lock', 'rollback']);
    expect(h.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
    done();
  });

  it.each([false, true])('returns the locked namespace on explicit conflict, after insert race=%s', async (insertRace) => {
    const done = script([
      ...(insertRace ? [{ operation: 'lock' as const }, { operation: 'insert' as const }] : []),
      { operation: 'lock', rows: [row({ workspace: { activeOrganizationId: 'org-new' } })] },
    ]);
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null }, expectedVersion: 'old' }));
    expect(response.status).toBe(412);
    expect(await response.json()).toMatchObject({ error: { code: 'SETTINGS_VERSION_CONFLICT' }, settings: { activeOrganizationId: 'org-new' }, version: STORED_VERSION });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
    done();
  });

  it.each([
    [{ namespace: 'general', value: { replaced: true } }, { general: { replaced: true } }],
    [{ namespace: 'general', settings: { replaced: true } }, { general: { replaced: true } }],
    [{ settings: { general: { replaced: true } } }, { general: { replaced: true } }],
  ])('retains namespace replacement and shallow root merge for %j', async (body, delta) => {
    const stored = { general: { replaced: true }, untouched: { keep: true } };
    const done = script([
      { operation: 'lock', rows: [row({ general: { old: true }, untouched: { keep: true } })] },
      { operation: 'update', rows: [row(stored)] },
    ]);
    const response = await PUT(put(body));
    expect(response.status).toBe(200);
    expect(writtenDelta()).toEqual(delta);
    expect(await response.json()).toEqual(row(stored));
    done();
  });
});

describe('the exact JavaScript UTF-16 size contract', () => {
  it.each([100_000, 100_001])('handles a serialized candidate of %s code units', async (length) => {
    const overhead = JSON.stringify({ general: { text: '' } }).length;
    const remaining = length - overhead;
    const text = '😀'.repeat(Math.floor(remaining / 2)) + (remaining % 2 ? 'x' : '');
    const settings = { general: { text } };
    expect(JSON.stringify(settings).length).toBe(length);
    const done = script([
      { operation: 'lock', rows: [row()] },
      ...(length <= 100_000 ? [{ operation: 'update' as const, rows: [row(settings)] }] : []),
    ]);
    const response = await PUT(put({ namespace: 'general', patch: { text } }));
    expect(response.status).toBe(length <= 100_000 ? 200 : 400);
    expect(h.events.at(-1)).toBe(length <= 100_000 ? 'commit' : 'rollback');
    done();
  });

  it.each([false, true])('rejects combined sibling growth after locked reread, insert race=%s', async (insertRace) => {
    const done = script([
      ...(insertRace ? [{ operation: 'lock' as const }, { operation: 'insert' as const }] : []),
      { operation: 'lock', rows: [row({ general: { winner: 'x'.repeat(60_000) } })] },
    ]);
    const response = await PUT(put({ namespace: 'general', patch: { loser: 'y'.repeat(60_000) } }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('Settings payload is too large');
    expect(h.events.at(-1)).toBe('rollback');
    done();
  });

  it('rejects an oversized absent-row write before inserting', async () => {
    const done = script([{ operation: 'lock' }]);
    expect((await PUT(put({ namespace: 'general', value: { text: 'x'.repeat(100_000) } }))).status).toBe(400);
    done();
  });

  it('preserves validation precedence over explicit version conflict', async () => {
    const done = script([{ operation: 'lock', rows: [row()] }]);
    const response = await PUT(put({ namespace: 'general', value: { text: 'x'.repeat(100_000) }, expectedVersion: 'old' }));
    expect(response.status).toBe(400);
    expect(h.events.at(-1)).toBe('rollback');
    done();
  });
});

describe('committed receipts and workspace cache ordering', () => {
  it.each([
    undefined, {}, { settings: null, version: NEXT_VERSION },
    { settings: [], version: NEXT_VERSION }, { settings: false, version: NEXT_VERSION },
    { settings: 'invalid', version: NEXT_VERSION }, { settings: {} },
    { settings: {}, version: null }, { settings: {}, version: '' },
    { settings: {}, version: ' ' }, { settings: {}, version: 1 },
  ])('does not synthesize a stored receipt from %j', async (receipt) => {
    const done = script([
      { operation: 'lock', rows: [row({ workspace: {} })] },
      { operation: 'update', rows: receipt === undefined ? [] : [receipt] },
    ]);
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null } }));
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('settings');
    expect(h.events).toEqual(['begin', 'lock', 'update', 'commit', 'invalidate']);
    done();
  });

  it('returns an empty actual stored object, not the submitted estimate', async () => {
    const done = script([
      { operation: 'lock', rows: [row({ workspace: {} })] },
      { operation: 'update', rows: [{ settings: {}, version: NEXT_VERSION }] },
    ]);
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: {}, version: NEXT_VERSION });
    expect(h.events).toEqual(['begin', 'lock', 'update', 'commit', 'invalidate']);
    done();
  });

  it('does not invalidate or retry after a database write error', async () => {
    const done = script([
      { operation: 'lock', rows: [row({ workspace: {} })] },
      { operation: 'update', error: new Error('Database unavailable') },
    ]);
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null } }));
    expect(response.status).toBe(500);
    expect(h.events).toEqual(['begin', 'lock', 'update', 'rollback']);
    expect(h.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
    done();
  });
});

describe('transaction completion failures', () => {
  it('does not publish a receipt or invalidate after an uncertain commit error', async () => {
    const done = script([
      { operation: 'lock', rows: [row({ workspace: {} })] },
      { operation: 'update', rows: [row({ workspace: { activeOrganizationId: null } })] },
    ]);
    h.transaction.mockImplementation(async (callback: (tx: { query: typeof h.txQuery }) => Promise<unknown>) => {
      h.events.push('begin');
      await callback({ query: h.txQuery });
      h.events.push('commit-error');
      throw new Error('Connection lost during commit');
    });
    const response = await PUT(put({ namespace: 'workspace', patch: { activeOrganizationId: null } }));
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('settings');
    expect(h.events).toEqual(['begin', 'lock', 'update', 'commit-error']);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
    done();
  });
});
