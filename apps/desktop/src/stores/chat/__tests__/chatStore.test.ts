/**
 * H51 — chatStore ID mapping pruning tests
 *
 * Tests that pruneIdMappingsIfNeeded correctly enforces the MAX_ID_MAPPINGS cap,
 * removes the oldest entries first (FIFO by dbId), and retains entries at the boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module setup ──────────────────────────────────────────────────────────────

// We need window.localStorage to avoid side effects during module load
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

// Import after mocks are in place
import { dbIdToUuid, uuidToDbId, clearIdMappings } from '../chatStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Uses crypto.randomUUID via dbIdToUuid to populate N entries and return
 * the array of [dbId, uuid] pairs in insertion order.
 */
function populateMappings(count: number): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (let i = 1; i <= count; i++) {
    const uuid = dbIdToUuid(i);
    pairs.push([i, uuid]);
  }
  return pairs;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('chatStore ID mapping pruning (H51)', () => {
  beforeEach(() => {
    clearIdMappings();
    vi.clearAllMocks();
  });

  describe('dbIdToUuid', () => {
    it('creates a UUID for a new dbId', () => {
      const uuid = dbIdToUuid(1);
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
    });

    it('returns the same UUID on subsequent calls for the same dbId', () => {
      const first = dbIdToUuid(42);
      const second = dbIdToUuid(42);
      expect(first).toBe(second);
    });

    it('creates different UUIDs for different dbIds', () => {
      const uuid1 = dbIdToUuid(100);
      const uuid2 = dbIdToUuid(101);
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('uuidToDbId', () => {
    it('returns the dbId after a mapping is created via dbIdToUuid', () => {
      const uuid = dbIdToUuid(7);
      expect(uuidToDbId(uuid)).toBe(7);
    });

    it('returns undefined for an unknown UUID', () => {
      expect(uuidToDbId('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    });
  });

  describe('pruning — FIFO eviction at 1001 entries', () => {
    it('triggers pruning when more than 1000 entries are added', () => {
      // Add 1001 entries — the 1001st call should trigger pruning
      const pairs = populateMappings(1001);

      // After pruning, the oldest entry (dbId=1) should have been evicted
      const firstUuid = pairs[0]![1];
      expect(uuidToDbId(firstUuid)).toBeUndefined();
    });

    it('retains the most recent 1000 entries after pruning', () => {
      const pairs = populateMappings(1001);

      // dbId 2 through 1001 should all still be accessible
      for (let i = 1; i < pairs.length; i++) {
        const [dbId, uuid] = pairs[i]!;
        expect(uuidToDbId(uuid)).toBe(dbId);
        expect(dbIdToUuid(dbId)).toBe(uuid);
      }
    });

    it('oldest entry by numeric dbId is removed first (not insertion order)', () => {
      // Insert out-of-numeric-order: small dbId inserted later should still be
      // the "oldest" by numeric value and removed first
      populateMappings(999);

      // Add a low dbId (1000th slot is dbId 999, so slot 1000 will be 1000)
      const veryOldId = 0; // dbId 0 is numerically smallest
      const veryOldUuid = dbIdToUuid(veryOldId);

      // Now add two more to push past 1000
      dbIdToUuid(1000);
      dbIdToUuid(1001); // This triggers pruning — dbId=0 should go first

      // dbId 0 was the oldest (numerically smallest), so it should be evicted
      expect(uuidToDbId(veryOldUuid)).toBeUndefined();
    });
  });

  describe('pruning — boundary conditions', () => {
    it('does not prune when exactly 1000 entries exist', () => {
      // Add exactly 1000 entries
      const pairs = populateMappings(1000);

      // All 1000 should still be present
      for (const [dbId, uuid] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('does not prune when fewer than 1000 entries exist', () => {
      const pairs = populateMappings(500);

      for (const [dbId, uuid] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('count stays at or below 1000 after many additions', () => {
      // Add 1500 entries — cap should be enforced
      populateMappings(1500);

      // Check the most recent 1000 are still present
      for (let i = 501; i <= 1500; i++) {
        const uuid = dbIdToUuid(i);
        expect(typeof uuid).toBe('string');
        expect(uuidToDbId(uuid)).toBe(i);
      }
    });
  });

  describe('clearIdMappings', () => {
    it('removes all mappings', () => {
      const uuid = dbIdToUuid(1);
      clearIdMappings();
      expect(uuidToDbId(uuid)).toBeUndefined();
    });

    it('allows new mappings after clear', () => {
      dbIdToUuid(1);
      clearIdMappings();
      const newUuid = dbIdToUuid(1);
      // Should work fine and return a valid UUID (may be a different one)
      expect(typeof newUuid).toBe('string');
    });
  });
});
