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

describe('linkConversationId', () => {
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

  describe('no eviction', () => {
    it('keeps every linked conversation past the old 1000-entry cap', () => {
      const pairs = linkMany(1500);

      for (const [uuid, dbId] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
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
  });
});
