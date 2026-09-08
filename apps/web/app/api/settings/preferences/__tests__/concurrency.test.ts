import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: h.getUserScopedDb }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: h.invalidateActiveOrganizationCache,
  getCachedActiveOrganizationId: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

const STORED_VERSION = '2026-09-07T10:00:00.000Z';
const NEXT_VERSION = '2026-09-07T10:00:01.000Z';

function stubStore(options: {
  settings: Record<string, unknown>;
  version: string | null;
  writeAccepted?: boolean;
}) {
  h.query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    if (String(sql).includes('insert into public.user_settings')) {
      if (options.writeAccepted === false) return [];
      const delta = JSON.parse(String(params?.[1])) as Record<string, unknown>;
      return [{ settings: { ...options.settings, ...delta }, updated_at: NEXT_VERSION }];
    }
    return [{ settings: options.settings, updated_at: options.version }];
  });
}

function put(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function writeCalls() {
  return h.query.mock.calls.filter((call) =>
    String(call[0]).includes('insert into public.user_settings'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserScopedDb.mockResolvedValue({ db: { query: h.query }, userId: 'user-1' });
});

describe('the preferences PUT can be made conditional', () => {
  it('reports the stored revision on read so a caller can send it back', async () => {
    stubStore({ settings: { capabilities: { memory: true } }, version: STORED_VERSION });

    const response = await GET(new NextRequest('http://localhost:3000/api/settings/preferences'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe(STORED_VERSION);
  });

  it('refuses a write whose expected revision no longer matches', async () => {
    stubStore({
      settings: { capabilities: { memory: true } },
      version: STORED_VERSION,
      writeAccepted: false,
    });

    const response = await PUT(
      put({
        namespace: 'capabilities',
        value: { memory: false },
        expectedVersion: '2026-09-07T09:00:00.000Z',
      }),
    );

    expect(response.status).toBe(412);
    const body = await response.json();
    expect(body.version).toBe(STORED_VERSION);
    expect(body.settings).toEqual({ memory: true });
  });

  it('accepts a write whose expected revision still matches, and returns the new one', async () => {
    stubStore({ settings: { capabilities: { memory: true } }, version: STORED_VERSION });

    const response = await PUT(
      put({
        namespace: 'capabilities',
        value: { memory: false },
        expectedVersion: STORED_VERSION,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe(NEXT_VERSION);
    expect(writeCalls()).toHaveLength(1);
    expect(writeCalls()[0]?.[1]?.[2]).toBe(STORED_VERSION);
  });

  it('leaves an unconditional write exactly as it was', async () => {
    stubStore({ settings: { capabilities: { memory: true } }, version: STORED_VERSION });

    const response = await PUT(put({ namespace: 'capabilities', value: { memory: false } }));

    expect(response.status).toBe(200);
    expect(writeCalls()[0]?.[1]?.[2]).toBeNull();
  });
});

describe('a namespace can be patched rather than replaced', () => {
  it('keeps keys the patch does not mention', async () => {
    stubStore({
      settings: { capabilities: { memory: true, searchPastChats: true } },
      version: STORED_VERSION,
    });

    const response = await PUT(put({ namespace: 'capabilities', patch: { memory: false } }));

    expect(response.status).toBe(200);
    const written = JSON.parse(String(writeCalls()[0]?.[1]?.[1])) as {
      capabilities: Record<string, unknown>;
    };
    expect(written.capabilities).toEqual({ memory: false, searchPastChats: true });
  });

  it('still replaces the namespace when value is sent instead of patch', async () => {
    stubStore({
      settings: { capabilities: { memory: true, searchPastChats: true } },
      version: STORED_VERSION,
    });

    await PUT(put({ namespace: 'capabilities', value: { memory: false } }));

    const written = JSON.parse(String(writeCalls()[0]?.[1]?.[1])) as {
      capabilities: Record<string, unknown>;
    };
    expect(written.capabilities).toEqual({ memory: false });
  });
});
