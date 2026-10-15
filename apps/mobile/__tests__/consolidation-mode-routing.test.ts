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

describe('consolidateFactsFromTurn, on-device (local) persistence', () => {
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

  it('leaves a learned sensitive fact off the device until the opt-in is on', async () => {
    const off = await consolidateFactsFromTurn({
      message: 'I am a practicing Catholic.',
      conversationId: 'c',
    });
    expect(off.inserted).toBe(0);
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();

    const on = await consolidateFactsFromTurn({
      message: 'I am a practicing Catholic.',
      conversationId: 'c',
      includeSensitiveTopics: true,
    });
    expect(on.inserted).toBe(1);
    expect(mockInsertMemoryFact).toHaveBeenCalledWith(
      expect.objectContaining({ fact: 'User is a practicing Catholic', source: 'learned' }),
    );
  });

  it('reads a noted first-person fact the way it reads the same fact about the user', async () => {
    for (const message of [
      'Note that I suffer from depression.',
      'For future reference, I take Lexapro.',
      'Note that I belong to a union.',
      'Note that im gay.',
    ]) {
      const off = await consolidateFactsFromTurn({ message, conversationId: 'c' });
      expect(off.inserted).toBe(0);
    }
    expect(mockInsertMemoryFact).not.toHaveBeenCalled();

    const on = await consolidateFactsFromTurn({
      message: 'Note that I suffer from depression.',
      conversationId: 'c',
      includeSensitiveTopics: true,
    });
    expect(on.inserted).toBe(1);
    expect(mockInsertMemoryFact).toHaveBeenCalledWith(
      expect.objectContaining({ fact: 'I suffer from depression', source: 'learned' }),
    );
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
