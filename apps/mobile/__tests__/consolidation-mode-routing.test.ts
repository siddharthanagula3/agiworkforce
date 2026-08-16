
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

import {
  consolidateFactsFromTurn,
  shouldConsolidateMemoryOnClient,
} from '../src/features/memory/services/consolidation';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('consolidateFactsFromTurn — on-device (local) persistence', () => {
  it('writes extracted facts to on-device SQLite', async () => {
    const res = await consolidateFactsFromTurn({
      message: 'my name is Grace Hopper',
      conversationId: 'conv-2',
    });

    expect(res.inserted).toBeGreaterThan(0);
    expect(mockInsertMemoryFact).toHaveBeenCalled();
  });

  it('works with a null conversationId', async () => {
    await consolidateFactsFromTurn({ message: 'my name is Alan Turing', conversationId: null });
    expect(mockInsertMemoryFact).toHaveBeenCalled();
  });

  it('skips entirely when disabled (temporary/incognito chat)', async () => {
    const res = await consolidateFactsFromTurn({
      message: 'my name is Katherine Johnson',
      conversationId: 'c',
      enabled: false,
    });
    expect(res).toEqual({ extracted: 0, inserted: 0 });
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();
  });

  describe('shouldConsolidateMemoryOnClient (call-site gate)', () => {
    it('consolidates on-device for a local, non-temporary turn', () => {
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'local',
          isTemporaryChat: false,
          memoryEnabled: true,
          generateMemoryFromHistory: true,
        }),
      ).toBe(true);
    });

    it('does NOT consolidate on the client for a cloud turn (server owns cloud auto-memory)', () => {
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'cloud',
          isTemporaryChat: false,
          memoryEnabled: true,
          generateMemoryFromHistory: true,
        }),
      ).toBe(false);
    });

    it('never consolidates in a temporary chat, in either mode', () => {
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'local',
          isTemporaryChat: true,
          memoryEnabled: true,
          generateMemoryFromHistory: true,
        }),
      ).toBe(false);
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'cloud',
          isTemporaryChat: true,
          memoryEnabled: true,
          generateMemoryFromHistory: true,
        }),
      ).toBe(false);
    });

    it('does not learn when either memory preference is off', () => {
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'local',
          isTemporaryChat: false,
          memoryEnabled: false,
          generateMemoryFromHistory: true,
        }),
      ).toBe(false);
      expect(
        shouldConsolidateMemoryOnClient({
          executionMode: 'local',
          isTemporaryChat: false,
          memoryEnabled: true,
          generateMemoryFromHistory: false,
        }),
      ).toBe(false);
    });
  });
});
