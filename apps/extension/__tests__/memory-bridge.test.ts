/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  const mock = {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        Object.assign(store, entries);
      }),
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
      _store: store,
      _reset: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = { storage: mock };
  return mock;
});

const authMock = vi.hoisted(() => ({
  gateway: 'https://gateway.test',
  getManagedCloudAuthContext: vi.fn(),
}));

const GATEWAY = authMock.gateway;

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  FREE_TRIAL_GATEWAY: authMock.gateway,
  getManagedCloudAuthContext: authMock.getManagedCloudAuthContext,
}));

import {
  ACCOUNT_MEMORY_CACHE_KEY,
  memoryAdd,
  memoryDelete,
  memoryList,
  memoryUpdate,
} from '../src/background/memory-bridge.ts';
import {
  deleteAccountMemory,
  fetchAccountMemories,
  parseAccountMemory,
  parseAccountMemoryList,
} from '../src/features/cloud-bridge/memoryClient.ts';

const OWNER = { accountId: 'user_1', authIncarnation: 'session_1' };

function row(id: string, content: string) {
  return {
    id,
    content,
    category: null,
    source: 'web',
    pinned: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function cacheWith(owner: typeof OWNER, contents: string[]) {
  return {
    owner,
    fetchedAtMs: Date.now(),
    items: contents.map((content, index) => row(`cached-${index}`, content)),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  storageMock.local._reset();
  vi.clearAllMocks();
  authMock.getManagedCloudAuthContext.mockResolvedValue({ token: 'tok', owner: OWNER });
});

describe('signed-out boundary', () => {
  beforeEach(() => {
    authMock.getManagedCloudAuthContext.mockResolvedValue(null);
  });

  it('never reads the cache as account memory when signed out', async () => {
    await storageMock.local.set({ [ACCOUNT_MEMORY_CACHE_KEY]: cacheWith(OWNER, ['private fact']) });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await memoryList();

    expect(result.status).toBe('signed-out');
    expect(result.memories).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageMock.local._store[ACCOUNT_MEMORY_CACHE_KEY]).toBeUndefined();
  });

  it('refuses writes and drops the cache when signed out', async () => {
    await storageMock.local.set({ [ACCOUNT_MEMORY_CACHE_KEY]: cacheWith(OWNER, ['private fact']) });
    vi.stubGlobal('fetch', vi.fn());

    expect((await memoryAdd('new fact')).status).toBe('signed-out');
    expect((await memoryUpdate('id', 'edited')).status).toBe('signed-out');
    expect((await memoryDelete('id')).status).toBe('signed-out');
    expect(storageMock.local._store[ACCOUNT_MEMORY_CACHE_KEY]).toBeUndefined();
  });

  it('reports signed-out when the account rejects the token', async () => {
    authMock.getManagedCloudAuthContext.mockResolvedValue({ token: 'stale', owner: OWNER });
    await storageMock.local.set({ [ACCOUNT_MEMORY_CACHE_KEY]: cacheWith(OWNER, ['private fact']) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401)),
    );

    const result = await memoryList();

    expect(result.status).toBe('signed-out');
    expect(result.memories).toEqual([]);
    expect(storageMock.local._store[ACCOUNT_MEMORY_CACHE_KEY]).toBeUndefined();
  });

  it('never serves another account’s cached memories', async () => {
    authMock.getManagedCloudAuthContext.mockResolvedValue({ token: 'tok', owner: OWNER });
    await storageMock.local.set({
      [ACCOUNT_MEMORY_CACHE_KEY]: cacheWith({ accountId: 'user_2', authIncarnation: 'session_2' }, [
        'someone else',
      ]),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'offline' }, 503)),
    );

    const result = await memoryList();

    expect(result.status).toBe('unavailable');
    expect(result.memories).toEqual([]);
  });
});

describe('hosted memory client mapping', () => {
  it('lists the account memories from the hosted route', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ memories: [row('m1', 'first'), row('m2', 'second')] }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await memoryList();

    expect(result.status).toBe('ready');
    expect(result.fromCache).toBe(false);
    expect(result.memories.map((memory) => memory.id)).toEqual(['m1', 'm2']);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(`${GATEWAY}/api/memory?`)).toBe(true);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('falls back to the cached page when the account cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ memories: [row('m1', 'first')] })),
    );
    await memoryList();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await memoryList();

    expect(result.status).toBe('ready');
    expect(result.fromCache).toBe(true);
    expect(result.memories.map((memory) => memory.content)).toEqual(['first']);
    expect(result.error).toBeTruthy();
  });

  it('sends an edit as a PUT on the memory id and a delete as a DELETE', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ memory: row('m1', 'edited') }));
    vi.stubGlobal('fetch', fetchSpy);

    const updated = await memoryUpdate('m1', '  edited  ');
    expect(updated.status).toBe('ready');
    expect(updated.memory?.content).toBe('edited');
    const [updateUrl, updateInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(updateUrl).toBe(`${GATEWAY}/api/memory/m1`);
    expect(updateInit.method).toBe('PUT');
    expect(JSON.parse(String(updateInit.body))).toEqual({ content: 'edited' });

    await deleteAccountMemory('tok', 'm1');
    const [deleteUrl, deleteInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(deleteUrl).toBe(`${GATEWAY}/api/memory/m1`);
    expect(deleteInit.method).toBe('DELETE');
  });

  it('drops rows that are missing the fields the panel renders', () => {
    const memories = parseAccountMemoryList({
      memories: [row('m1', 'kept'), { id: 'm2' }, null, 42],
    });
    expect(memories.map((memory) => memory.id)).toEqual(['m1']);
  });

  it('rejects a create response that carries no memory', () => {
    expect(() => parseAccountMemory({ memory: { id: 'm1' } })).toThrow();
  });

  it('raises a typed error the panel can show when the route fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Rate limited' }, 429)),
    );
    await expect(fetchAccountMemories('tok')).rejects.toMatchObject({
      status: 429,
      message: 'Rate limited',
    });
  });
});
