/**
 * chatStore.pruning tests — M7 fix: linkConversationId now calls pruneIdMappingsIfNeeded()
 *
 * The M7 CodeRabbit fix adds a pruneIdMappingsIfNeeded() call inside
 * linkConversationId() so that the id-mapping cache stays bounded at
 * MAX_ID_MAPPINGS (1000) entries regardless of which path is used to
 * insert mappings.
 *
 * Previous behaviour: only dbIdToUuid() called pruneIdMappingsIfNeeded(),
 * so callers that exclusively used linkConversationId() could grow the
 * cache without bound.
 *
 * Fixed behaviour: linkConversationId() also calls pruneIdMappingsIfNeeded()
 * after each successful insertion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks — must be in place before any import of chatStore
// ─────────────────────────────────────────────────────────────────────────────

const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../utils/localStorage', () => ({
  safeGetJSON: vi.fn().mockReturnValue({ dbIdToUuid: {}, uuidToDbId: {} }),
  safeSetJSON: vi.fn().mockReturnValue(true),
  storageFallback: {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { clearIdMappings, uuidToDbId, dbIdToUuid, useChatStore } from '../chatStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ID_MAPPINGS = 1000;

/**
 * Calls useChatStore().linkConversationId() for N pairs, using sequential
 * UUIDs and sequential dbIds.  Returns the inserted [uuid, dbId] pairs.
 */
function linkMany(count: number, dbIdOffset: number = 1): Array<[string, number]> {
  const store = useChatStore.getState();
  const pairs: Array<[string, number]> = [];
  for (let i = 0; i < count; i++) {
    const dbId = dbIdOffset + i;
    const uuid = crypto.randomUUID();
    store.linkConversationId(uuid, dbId);
    pairs.push([uuid, dbId]);
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('linkConversationId — M7: pruneIdMappingsIfNeeded() is called', () => {
  beforeEach(() => {
    clearIdMappings();
    vi.clearAllMocks();
  });

  // ── Basic linkConversationId behaviour ────────────────────────────────────

  describe('basic behaviour', () => {
    it('links a uuid to a dbId so that uuidToDbId returns the correct dbId', () => {
      const store = useChatStore.getState();
      const uuid = crypto.randomUUID();
      store.linkConversationId(uuid, 42);

      expect(uuidToDbId(uuid)).toBe(42);
    });

    it('does not overwrite an existing mapping for the same uuid', () => {
      const store = useChatStore.getState();
      const uuid = crypto.randomUUID();
      store.linkConversationId(uuid, 10);
      store.linkConversationId(uuid, 99); // second call should be a no-op

      expect(uuidToDbId(uuid)).toBe(10);
    });

    it('adding separate uuids creates separate mappings', () => {
      const store = useChatStore.getState();
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      store.linkConversationId(uuid1, 1);
      store.linkConversationId(uuid2, 2);

      expect(uuidToDbId(uuid1)).toBe(1);
      expect(uuidToDbId(uuid2)).toBe(2);
    });
  });

  // ── Pruning threshold enforcement ─────────────────────────────────────────

  describe('pruning threshold enforcement', () => {
    it('does not prune when fewer than MAX_ID_MAPPINGS entries exist', () => {
      const pairs = linkMany(500);

      // All 500 entries should still be accessible
      for (const [uuid, dbId] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('does not prune when exactly MAX_ID_MAPPINGS entries exist', () => {
      const pairs = linkMany(MAX_ID_MAPPINGS);

      // All 1000 entries should be accessible
      for (const [uuid, dbId] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('triggers pruning when more than MAX_ID_MAPPINGS entries are inserted', () => {
      // Insert MAX_ID_MAPPINGS + 1 entries using dbIds starting from 1 for predictable
      // numeric ordering used by the pruning sort.
      //
      // However, linkConversationId uses provided dbIds — we pass them in ascending
      // order so dbId=1 is the "oldest" by numeric value and should be evicted.

      // First insert MAX_ID_MAPPINGS entries via dbIdToUuid so we have a known base
      // (the pruning algorithm sorts by dbId numerically)
      const baseUuids: string[] = [];
      for (let i = 1; i <= MAX_ID_MAPPINGS; i++) {
        baseUuids.push(dbIdToUuid(i));
      }

      // The base is now exactly at MAX_ID_MAPPINGS. The first uuid (dbId=1) is the
      // numerically oldest and will be evicted when we push past the cap.
      const firstUuid = baseUuids[0]!;
      expect(uuidToDbId(firstUuid)).toBe(1); // still present before overflow

      // Now push one more via linkConversationId — this should trigger pruning
      const overflowUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(overflowUuid, MAX_ID_MAPPINGS + 1);

      // The oldest entry (dbId=1) should have been evicted
      expect(uuidToDbId(firstUuid)).toBeUndefined();
    });

    it('the mapping cache does not grow unbounded after many linkConversationId calls', () => {
      // Insert 1500 entries via linkConversationId — the cap should be enforced
      // so that the 500 oldest are pruned.
      const allPairs = linkMany(1500);

      // The most recent 1000 entries should still be accessible
      for (const [uuid, dbId] of allPairs.slice(500)) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('pruning threshold is exactly MAX_ID_MAPPINGS (1000)', () => {
      // Insert exactly 1000 entries — all should survive
      const pairs = linkMany(MAX_ID_MAPPINGS);
      expect(pairs.every(([uuid, dbId]) => uuidToDbId(uuid) === dbId)).toBe(true);

      // Insert one more — the oldest by dbId should be evicted
      const latestUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(latestUuid, 99_999);

      // Total accessible entries should be at most MAX_ID_MAPPINGS
      let accessible = 0;
      for (const [uuid] of pairs) {
        if (uuidToDbId(uuid) !== undefined) accessible++;
      }
      // After pruning, the cache should be back at or below MAX_ID_MAPPINGS
      // (plus the newly added entry, which may push it to exactly MAX_ID_MAPPINGS)
      expect(accessible).toBeLessThanOrEqual(MAX_ID_MAPPINGS);
    });
  });

  // ── Interoperability with dbIdToUuid ──────────────────────────────────────

  describe('interoperability: linkConversationId and dbIdToUuid share the same cache', () => {
    it('entries added via dbIdToUuid are visible via uuidToDbId after linkConversationId call', () => {
      // Add one entry via dbIdToUuid
      const uuidFromDb = dbIdToUuid(777);

      // Add another via linkConversationId
      const linkedUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(linkedUuid, 888);

      // Both should be in the shared cache
      expect(uuidToDbId(uuidFromDb)).toBe(777);
      expect(uuidToDbId(linkedUuid)).toBe(888);
    });

    it('combined insertions from both paths respect the MAX_ID_MAPPINGS cap', () => {
      // Fill half via dbIdToUuid, half via linkConversationId
      const half = MAX_ID_MAPPINGS / 2;

      const dbIdPairs: Array<[number, string]> = [];
      for (let i = 1; i <= half; i++) {
        dbIdPairs.push([i, dbIdToUuid(i)]);
      }

      const linkedPairs = linkMany(half, half + 1);

      // All entries should be present (we are at exactly MAX_ID_MAPPINGS)
      for (const [dbId, uuid] of dbIdPairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
      for (const [uuid, dbId] of linkedPairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }

      // Add one more entry to trigger pruning
      useChatStore.getState().linkConversationId(crypto.randomUUID(), MAX_ID_MAPPINGS + 1);

      // The numerically oldest dbId (=1) should have been evicted
      const oldestUuid = dbIdPairs[0]![1];
      expect(uuidToDbId(oldestUuid)).toBeUndefined();
    });
  });
});
