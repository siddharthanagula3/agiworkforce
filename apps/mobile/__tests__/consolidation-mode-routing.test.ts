/**
 * Trust-boundary tests for consolidateFactsFromTurn mode routing.
 *
 * A cloud turn must write learned facts to the CLOUD memory store (+ sync queue)
 * and NEVER to on-device SQLite; a local turn must write to SQLite and never to
 * the cloud store. Guards the M2.2 cloud-memory-injection change.
 */

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
}));

const mockInsertMemoryFact = jest.fn().mockResolvedValue(undefined);
const mockListMemoryFacts = jest.fn().mockResolvedValue([]);
jest.mock('../storage/memory', () => ({
  insertMemoryFact: (...args: unknown[]) => mockInsertMemoryFact(...args),
  listMemoryFacts: (...args: unknown[]) => mockListMemoryFacts(...args),
}));

const mockMarkMemoryForSync = jest.fn();
jest.mock('../services/cloudSyncEngine', () => ({
  markMemoryForSync: (...args: unknown[]) => mockMarkMemoryForSync(...args),
}));

import {
  consolidateFactsFromTurn,
  shouldConsolidateMemoryOnClient,
} from '../src/features/memory/services/consolidation';
import { useCloudMemoryStore } from '../stores/memory/cloudMemoryStore';

beforeEach(() => {
  jest.clearAllMocks();
  useCloudMemoryStore.getState().clearCloudMemoryData();
});

describe('consolidateFactsFromTurn — mode routing', () => {
  it('cloud mode writes to the cloud memory store + sync queue, never to SQLite', async () => {
    const res = await consolidateFactsFromTurn({
      message: 'my name is Ada Lovelace',
      conversationId: 'conv-1',
      executionMode: 'cloud',
    });

    expect(res.inserted).toBeGreaterThan(0);
    const entries = useCloudMemoryStore.getState().entries;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]!.content).toContain('Ada Lovelace');
    expect(entries[0]!.source).toBe('mobile');
    expect(mockMarkMemoryForSync).toHaveBeenCalledTimes(entries.length);
    // TRUST BOUNDARY: no on-device SQLite write for a cloud turn.
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();
  });

  it('local mode writes to SQLite, never to the cloud store', async () => {
    const res = await consolidateFactsFromTurn({
      message: 'my name is Grace Hopper',
      conversationId: 'conv-2',
      executionMode: 'local',
    });

    expect(res.inserted).toBeGreaterThan(0);
    expect(mockInsertMemoryFact).toHaveBeenCalled();
    // TRUST BOUNDARY: no cloud write / sync for a local turn.
    expect(useCloudMemoryStore.getState().entries.length).toBe(0);
    expect(mockMarkMemoryForSync).not.toHaveBeenCalled();
  });

  it('defaults to local mode when executionMode is omitted', async () => {
    await consolidateFactsFromTurn({ message: 'my name is Alan Turing', conversationId: null });
    expect(mockInsertMemoryFact).toHaveBeenCalled();
    expect(mockMarkMemoryForSync).not.toHaveBeenCalled();
  });

  it('skips entirely when disabled (temporary/incognito chat)', async () => {
    const res = await consolidateFactsFromTurn({
      message: 'my name is Katherine Johnson',
      conversationId: 'c',
      executionMode: 'cloud',
      enabled: false,
    });
    expect(res).toEqual({ extracted: 0, inserted: 0 });
    expect(useCloudMemoryStore.getState().entries.length).toBe(0);
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();
  });

  describe('shouldConsolidateMemoryOnClient (call-site gate)', () => {
    it('consolidates on-device for a local, non-temporary turn', () => {
      expect(
        shouldConsolidateMemoryOnClient({ executionMode: 'local', isTemporaryChat: false }),
      ).toBe(true);
    });

    it('does NOT consolidate on the client for a cloud turn (server owns cloud auto-memory)', () => {
      expect(
        shouldConsolidateMemoryOnClient({ executionMode: 'cloud', isTemporaryChat: false }),
      ).toBe(false);
    });

    it('never consolidates in a temporary chat, in either mode', () => {
      expect(
        shouldConsolidateMemoryOnClient({ executionMode: 'local', isTemporaryChat: true }),
      ).toBe(false);
      expect(
        shouldConsolidateMemoryOnClient({ executionMode: 'cloud', isTemporaryChat: true }),
      ).toBe(false);
    });
  });
});
