/**
 * Cloud memory sync — unit tests.
 *
 * Verifies the managed-only memory delta-sync loop:
 *  - Managed-cloud gate: zero network I/O in local mode.
 *  - Cursor: memory cursor advances independently from the chat cursor.
 *  - Store separation: a local-mode memory write never touches the cloud store
 *    or the dirty queue (trust-boundary enforcement).
 *  - Tombstone: is_deleted deltas hard-delete from the cloud store.
 *  - Push / ack: server-acked IDs are cleared from the dirty queue; tombstones
 *    that are acked are hard-deleted locally.
 *  - Pagination: follows hasMore until false.
 */

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

// Stub uuidv7 so the memory store can import it without a runtime environment.
jest.mock('@agiworkforce/utils', () => ({
  uuidv7: jest.fn(() => `00000000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`),
  isUuidV7: jest.fn(() => true),
  setUuidV7RandomSource: jest.fn(),
}));

// Stub SQLite storage so local-mode memory writes don't crash in the test env.
jest.mock('../storage/memory', () => ({
  insertMemoryFact: jest.fn().mockResolvedValue(undefined),
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
  searchMemoryByEmbedding: jest.fn().mockResolvedValue([]),
}));

import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudMemoryStore } from '../stores/memory/cloudMemoryStore';
import { useMemorySyncStateStore } from '../stores/memory/memorySyncStateStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { syncNow, markMemoryForSync } from '../services/cloudSyncEngine';
import { useMemoryStore } from '../src/features/memory/store';
import { insertMemoryFact, togglePinMemoryFact } from '../storage/memory';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;
const mockTogglePinMemoryFact = togglePinMemoryFact as jest.MockedFunction<
  typeof togglePinMemoryFact
>;

const T = '2026-06-22T00:00:00.000Z';
const MEMORY_SYNC_PATH = '/api/memory/sync';

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyMemoryPull(cursor = '0') {
  return { memories: [], cursor, hasMore: false };
}

function emptyChatPull() {
  return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
}

/**
 * Contract-valid empty pull for whichever sync endpoint `path` hits. The
 * engine now schema-validates every response, so a chat-shaped page returned
 * for the projects/settings endpoints fails the parse and flips sync status
 * to 'error'.
 */
function defaultPull(path: string) {
  if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
  if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
  if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
  return emptyChatPull();
}

function memoryPullItem(
  id: string,
  serverVersion: string,
  opts: { isDeleted?: boolean; content?: string } = {},
) {
  return {
    id,
    content: opts.content ?? `Memory content ${id}`,
    category: null,
    source: 'web' as const,
    pinned: false,
    is_deleted: opts.isDeleted ?? false,
    created_at: T,
    updated_at: T,
    server_version: serverVersion,
  };
}

function seedCloudMemory(id: string, content = 'test', isDeleted = false) {
  useCloudMemoryStore.getState().upsertCloudMemory({
    id,
    content,
    category: null,
    source: 'mobile',
    pinned: false,
    isDeleted,
    createdAt: T,
    updatedAt: T,
  });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('memory-sync-test-user');
  useCloudSyncStateStore.getState().reset();
  useCloudMemoryStore.getState().clearCloudMemoryData();
  useMemorySyncStateStore.getState().resetMemorySync();
  useChatAppModeStore.getState().setAppMode('cloud');

  // Default: chat pull returns empty; memory pull returns empty.
  mockGet.mockImplementation(async (path: string) => {
    if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
    return defaultPull(path as string) as never;
  });

  // Default: POST acks all submitted items.
  mockPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
    if ((path as string) === MEMORY_SYNC_PATH) {
      const mems = (body?.memories as Array<{ id: string }>) ?? [];
      return {
        protocolVersion: 2,
        applied: mems.map((m) => ({ id: m.id, server_version: '1' })),
        conflicts: [],
        cursor: '1',
      } as never;
    }
    // Chat sync ack
    const convs = (body?.conversations as Array<{ id: string }>) ?? [];
    const msgs = (body?.messages as Array<{ id: string }>) ?? [];
    return {
      protocolVersion: 2,
      applied: {
        conversations: convs.map((c) => ({ id: c.id, server_version: '1' })),
        messages: msgs.map((m) => ({ id: m.id, server_version: '1' })),
        artifacts: [],
      },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '1',
    } as never;
  });
});

// ── Gate tests ─────────────────────────────────────────────────────────────────

describe('memory sync — managed gate', () => {
  it('makes ZERO memory network calls in local mode', async () => {
    useChatAppModeStore.getState().setAppMode('local');
    await syncNow();
    // No call to /api/memory/sync at all.
    const memoryCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/memory/sync'),
    );
    const memoryPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === MEMORY_SYNC_PATH,
    );
    expect(memoryCalls).toHaveLength(0);
    expect(memoryPostCalls).toHaveLength(0);
  });

  it('makes memory network calls in cloud mode', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    await syncNow();
    const memoryCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/memory/sync'),
    );
    expect(memoryCalls.length).toBeGreaterThan(0);
  });
});

// ── Cursor advance ─────────────────────────────────────────────────────────────

describe('memory sync — cursor', () => {
  it('starts at "0" and advances to the server cursor after a pull', async () => {
    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('0');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync'))
        return { memories: [memoryPullItem('m1', '7')], cursor: '7', hasMore: false } as never;
      return defaultPull(path as string) as never;
    });

    await syncNow();

    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('7');
    // Next pull must pass the new cursor.
    expect(mockGet).toHaveBeenCalledWith('/api/memory/sync?since=0');
  });

  it('uses the memory cursor independently from the chat cursor', async () => {
    // Pre-set the chat cursor to something non-zero.
    useCloudSyncStateStore.getState().setCursor('42');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync'))
        return { memories: [], cursor: '15', hasMore: false } as never;
      return {
        conversations: [],
        messages: [],
        artifacts: [],
        cursor: '42',
        hasMore: false,
      } as never;
    });

    await syncNow();

    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('15');
    expect(useCloudSyncStateStore.getState().cursor).toBe('42');
  });

  it('follows memory pagination until hasMore is false', async () => {
    let callCount = 0;
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync')) {
        callCount += 1;
        if (callCount === 1)
          return {
            memories: [memoryPullItem('m1', '5')],
            cursor: '5',
            hasMore: true,
          } as never;
        return {
          memories: [memoryPullItem('m2', '10')],
          cursor: '10',
          hasMore: false,
        } as never;
      }
      return defaultPull(path as string) as never;
    });

    await syncNow();

    expect(callCount).toBe(2);
    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('10');
    const ids = useCloudMemoryStore.getState().entries.map((e) => e.id);
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
  });
});

// ── Tombstone application ──────────────────────────────────────────────────────

describe('memory sync — tombstone application', () => {
  it('hard-deletes a memory entry when is_deleted:true is pulled', async () => {
    seedCloudMemory('m-del', 'to be deleted');
    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-del')).toBeDefined();

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync'))
        return {
          memories: [memoryPullItem('m-del', '9', { isDeleted: true })],
          cursor: '9',
          hasMore: false,
        } as never;
      return defaultPull(path as string) as never;
    });

    await syncNow();

    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-del')).toBeUndefined();
    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('9');
  });

  it('keeps a non-deleted entry after a pull without a tombstone for it', async () => {
    seedCloudMemory('m-keep', 'keeper');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync'))
        return { memories: [], cursor: '5', hasMore: false } as never;
      return defaultPull(path as string) as never;
    });

    await syncNow();

    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-keep')).toBeDefined();
  });
});

// ── Push ───────────────────────────────────────────────────────────────────────

describe('memory sync — push', () => {
  it('pushes dirty cloud memories and clears the dirty queue on ack', async () => {
    seedCloudMemory('m-push', 'push me');
    markMemoryForSync('m-push');
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toContain('m-push');

    await syncNow();

    const memoryCalls = mockPost.mock.calls.filter((c) => c[0] === MEMORY_SYNC_PATH);
    expect(memoryCalls).toHaveLength(1);
    const body = memoryCalls[0]![1] as { memories: Array<{ id: string; content: string }> };
    expect(body).toMatchObject({ protocolVersion: 2 });
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0]!.id).toBe('m-push');
    expect(body.memories[0]!.content).toBe('push me');
    expect(body.memories[0]).toMatchObject({ baseVersion: '0' });
    expect(body.memories[0]).not.toHaveProperty('updatedAt');
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).not.toContain('m-push');
  });

  it('preserves an edit made while a memory push is in flight', async () => {
    seedCloudMemory('m-race', 'sent');
    useCloudMemoryStore.getState().upsertCloudMemory({
      ...useCloudMemoryStore.getState().entries[0]!,
      serverVersion: '7',
    });
    markMemoryForSync('m-race');
    mockPost.mockImplementationOnce(async (path) => {
      expect(path).toBe(MEMORY_SYNC_PATH);
      const current = useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-race')!;
      useCloudMemoryStore.getState().upsertCloudMemory({ ...current, content: 'edited later' });
      return {
        protocolVersion: 2,
        applied: [{ id: 'm-race', server_version: '8' }],
        conflicts: [],
        cursor: '8',
      } as never;
    });

    await syncNow();

    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-race')).toMatchObject({
      content: 'edited later',
      serverVersion: '8',
    });
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toContain('m-race');
  });

  it('does NOT post to /api/memory/sync when dirty queue is empty', async () => {
    // No memories marked dirty.
    await syncNow();

    const memoryCalls = mockPost.mock.calls.filter((c) => c[0] === MEMORY_SYNC_PATH);
    expect(memoryCalls).toHaveLength(0);
  });

  it('sends isDeleted:true for a tombstone memory', async () => {
    seedCloudMemory('m-tomb', 'bye', /* isDeleted */ true);
    markMemoryForSync('m-tomb');

    await syncNow();

    const memoryCalls = mockPost.mock.calls.filter((c) => c[0] === MEMORY_SYNC_PATH);
    const body = memoryCalls[0]![1] as {
      memories: Array<{ id: string; isDeleted: boolean }>;
    };
    expect(body.memories[0]!.isDeleted).toBe(true);
    // After ack, the entry should be hard-deleted from the cloud store.
    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-tomb')).toBeUndefined();
    // Dirty queue cleared.
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).not.toContain('m-tomb');
  });

  it('keeps a tombstone dirty when the server does NOT ack it', async () => {
    seedCloudMemory('m-unacked', 'retry me', true);
    markMemoryForSync('m-unacked');

    // Server returns empty applied list (simulates server rejection).
    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === MEMORY_SYNC_PATH)
        return { protocolVersion: 2, applied: [], conflicts: [], cursor: '0' } as never;
      // Chat sync ack
      return {
        protocolVersion: 2,
        applied: { conversations: [], messages: [], artifacts: [] },
        conflicts: { conversations: [], messages: [], artifacts: [] },
        cursor: '0',
      } as never;
    });

    await syncNow();

    // The dirty ref should persist so the next syncNow retries it.
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toContain('m-unacked');
    // The tombstone row stays in the cloud store (not hard-deleted until acked).
    const entry = useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-unacked');
    expect(entry).toBeDefined();
    expect(entry?.isDeleted).toBe(true);
  });

  it('clears a dead ref (entry absent from cloud store) without crashing', async () => {
    // Mark an id dirty that does NOT exist in the cloud store.
    markMemoryForSync('ghost-id');

    await syncNow();

    // Dead ref should be cleared — nothing to push, no crash.
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).not.toContain('ghost-id');
    // Memory POST is not called (nothing to send).
    const memoryCalls = mockPost.mock.calls.filter((c) => c[0] === MEMORY_SYNC_PATH);
    expect(memoryCalls).toHaveLength(0);
  });
});

// ── Local / cloud store separation ────────────────────────────────────────────

const mockInsertMemoryFact = insertMemoryFact as jest.MockedFunction<typeof insertMemoryFact>;

describe('memory store — local/cloud separation', () => {
  it('a local-mode addMemory NEVER writes to the cloud store or dirty queue', async () => {
    useChatAppModeStore.getState().setAppMode('local');
    mockInsertMemoryFact.mockResolvedValue(undefined);

    await useMemoryStore.getState().addMemory('local fact only');

    // Cloud store must be untouched.
    expect(useCloudMemoryStore.getState().entries).toHaveLength(0);
    // Dirty queue must be empty.
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toHaveLength(0);
  });

  it('a cloud-mode addMemory writes to the cloud store with a UUIDv7 id, not SQLite', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    mockInsertMemoryFact.mockClear();

    await useMemoryStore.getState().addMemory('cloud fact');

    // Cloud store has the new entry.
    const cloudEntries = useCloudMemoryStore.getState().entries;
    expect(cloudEntries).toHaveLength(1);
    expect(cloudEntries[0]!.content).toBe('cloud fact');
    expect(cloudEntries[0]!.source).toBe('mobile');
    expect(cloudEntries[0]!.isDeleted).toBe(false);

    // SQLite path must NOT have been called.
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();

    // The new id must be in the dirty queue.
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toContain(cloudEntries[0]!.id);
  });
});

// ── Pin persistence (cloud mode) ────────────────────────────────────────────────

describe('memory store — cloud pin/unpin persistence', () => {
  it('a cloud-mode togglePin writes to the cloud store and marks it dirty, not SQLite', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    mockTogglePinMemoryFact.mockClear();

    await useMemoryStore.getState().addMemory('pin me');
    const entry = useCloudMemoryStore.getState().entries[0]!;
    useMemorySyncStateStore.getState().clearMemoryDirty([entry.id]);

    await useMemoryStore.getState().togglePin(entry.id);

    expect(useCloudMemoryStore.getState().entries[0]!.pinned).toBe(true);
    expect(useMemorySyncStateStore.getState().dirtyMemoryIds).toContain(entry.id);
    expect(mockTogglePinMemoryFact).not.toHaveBeenCalled();
  });

  it('pushes the pinned flag to the server on sync', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    await useMemoryStore.getState().addMemory('pin me too');
    const entry = useCloudMemoryStore.getState().entries[0]!;
    await useMemoryStore.getState().togglePin(entry.id);

    await syncNow();

    const pushCall = mockPost.mock.calls.find(([path]) => path === MEMORY_SYNC_PATH);
    expect(pushCall).toBeDefined();
    const body = pushCall![1] as { memories: Array<{ id: string; pinned?: boolean }> };
    const pushedEntry = body.memories.find((m) => m.id === entry.id);
    expect(pushedEntry?.pinned).toBe(true);
  });

  it('adopts the server pinned state from a pulled delta (LWW — pinned always on the wire)', async () => {
    // The /api/memory/sync contract (packages/contracts/cloud-contracts/src/sync.ts)
    // guarantees `pinned` on every delta, so the old "server omits pinned"
    // preserve-local fallback is gone. A pulled pinned:true delta must pin the
    // local entry; a locally-dirty pin is protected by push-before-pull order,
    // not by field omission (covered by the push test above).
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/memory/sync')) {
        return {
          memories: [
            { ...memoryPullItem('m-pinned', '5', { content: 'pinned on web' }), pinned: true },
          ],
          cursor: '5',
          hasMore: false,
        } as never;
      }
      return defaultPull(path as string) as never;
    });

    useChatAppModeStore.getState().setAppMode('cloud');
    seedCloudMemory('m-pinned', 'pinned on web');

    await syncNow();

    expect(useCloudMemoryStore.getState().entries.find((e) => e.id === 'm-pinned')?.pinned).toBe(
      true,
    );
  });
});
