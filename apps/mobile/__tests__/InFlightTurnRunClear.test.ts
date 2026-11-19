const mockStore = new Map<string, string>();

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
    delete: (key: string) => mockStore.delete(key),
  },
}));

import { storage } from '../lib/mmkv';
import {
  clearInFlightTurnRuns,
  inFlightTurnFor,
  recordInFlightTurnRun,
  recordInFlightTurnSend,
} from '../src/features/chat/inFlightTurnRun';

describe('clearInFlightTurnRuns', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('forgets every kept run so the next account finds none', () => {
    recordInFlightTurnSend({ conversationId: 'c1', questionId: 'q1', operationId: 'o1' });
    recordInFlightTurnRun({ conversationId: 'c2', questionId: 'q2', runId: 'r2' });

    clearInFlightTurnRuns();

    expect(inFlightTurnFor('c1', 'q1')).toBeNull();
    expect(inFlightTurnFor('c2', 'q2')).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it('does not throw when the storage cannot be written', () => {
    recordInFlightTurnSend({ conversationId: 'c1', questionId: 'q1', operationId: 'o1' });
    jest.spyOn(storage, 'delete').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });

    expect(() => clearInFlightTurnRuns()).not.toThrow();
  });
});
