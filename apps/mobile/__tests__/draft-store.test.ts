/**
 * Composer draft persistence (lib/draftStore) — survives unmount/backgrounding.
 * Backed by an in-memory MMKV mock so we exercise the real get/set/clear logic.
 */

const mockStore = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => void mockStore.set(k, v),
    removeItem: (k: string) => void mockStore.delete(k),
  },
}));

import { getDraft, setDraft, clearDraft } from '../lib/draftStore';

beforeEach(() => mockStore.clear());

describe('draftStore', () => {
  it('round-trips a draft for a key', () => {
    setDraft('conv-1', 'half typed message');
    expect(getDraft('conv-1')).toBe('half typed message');
  });

  it('keeps drafts isolated per key', () => {
    setDraft('conv-1', 'one');
    setDraft('conv-2', 'two');
    expect(getDraft('conv-1')).toBe('one');
    expect(getDraft('conv-2')).toBe('two');
  });

  it('empty / whitespace text clears the draft (no orphan stored)', () => {
    setDraft('conv-1', 'something');
    setDraft('conv-1', '   ');
    expect(getDraft('conv-1')).toBe('');
    expect(mockStore.has('composer-draft:conv-1')).toBe(false);
  });

  it('clearDraft removes a saved draft (e.g. after send)', () => {
    setDraft('conv-1', 'about to send');
    clearDraft('conv-1');
    expect(getDraft('conv-1')).toBe('');
  });

  it('returns "" and is a no-op for an undefined key', () => {
    expect(getDraft(undefined)).toBe('');
    expect(() => setDraft(undefined, 'x')).not.toThrow();
    expect(() => clearDraft(undefined)).not.toThrow();
    expect(mockStore.size).toBe(0);
  });
});
