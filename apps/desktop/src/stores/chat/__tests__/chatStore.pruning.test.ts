import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { clearIdMappings, uuidToDbId, dbIdToUuid, useChatStore } from '../chatStore';

const MAX_ID_MAPPINGS = 1000;

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

describe('linkConversationId — M7: pruneIdMappingsIfNeeded() is called', () => {
  beforeEach(() => {
    clearIdMappings();
    vi.clearAllMocks();
  });

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
      store.linkConversationId(uuid, 99);

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

  describe('pruning threshold enforcement', () => {
    it('does not prune when fewer than MAX_ID_MAPPINGS entries exist', () => {
      const pairs = linkMany(500);

      for (const [uuid, dbId] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('does not prune when exactly MAX_ID_MAPPINGS entries exist', () => {
      const pairs = linkMany(MAX_ID_MAPPINGS);

      for (const [uuid, dbId] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('triggers pruning when more than MAX_ID_MAPPINGS entries are inserted', () => {

      const baseUuids: string[] = [];
      for (let i = 1; i <= MAX_ID_MAPPINGS; i++) {
        baseUuids.push(dbIdToUuid(i));
      }

      const firstUuid = baseUuids[0]!;
      expect(uuidToDbId(firstUuid)).toBe(1);

      const overflowUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(overflowUuid, MAX_ID_MAPPINGS + 1);

      expect(uuidToDbId(firstUuid)).toBeUndefined();
    });

    it('the mapping cache does not grow unbounded after many linkConversationId calls', () => {
      const allPairs = linkMany(1500);

      for (const [uuid, dbId] of allPairs.slice(500)) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('pruning threshold is exactly MAX_ID_MAPPINGS (1000)', () => {
      const pairs = linkMany(MAX_ID_MAPPINGS);
      expect(pairs.every(([uuid, dbId]) => uuidToDbId(uuid) === dbId)).toBe(true);

      const latestUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(latestUuid, 99_999);

      let accessible = 0;
      for (const [uuid] of pairs) {
        if (uuidToDbId(uuid) !== undefined) accessible++;
      }
      expect(accessible).toBeLessThanOrEqual(MAX_ID_MAPPINGS);
    });
  });

  describe('interoperability: linkConversationId and dbIdToUuid share the same cache', () => {
    it('entries added via dbIdToUuid are visible via uuidToDbId after linkConversationId call', () => {
      const uuidFromDb = dbIdToUuid(777);

      const linkedUuid = crypto.randomUUID();
      useChatStore.getState().linkConversationId(linkedUuid, 888);

      expect(uuidToDbId(uuidFromDb)).toBe(777);
      expect(uuidToDbId(linkedUuid)).toBe(888);
    });

    it('combined insertions from both paths respect the MAX_ID_MAPPINGS cap', () => {
      const half = MAX_ID_MAPPINGS / 2;

      const dbIdPairs: Array<[number, string]> = [];
      for (let i = 1; i <= half; i++) {
        dbIdPairs.push([i, dbIdToUuid(i)]);
      }

      const linkedPairs = linkMany(half, half + 1);

      for (const [dbId, uuid] of dbIdPairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
      for (const [uuid, dbId] of linkedPairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }

      useChatStore.getState().linkConversationId(crypto.randomUUID(), MAX_ID_MAPPINGS + 1);

      const oldestUuid = dbIdPairs[0]![1];
      expect(uuidToDbId(oldestUuid)).toBeUndefined();
    });
  });
});
