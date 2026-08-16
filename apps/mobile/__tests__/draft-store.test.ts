
const mockStore = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => void mockStore.set(k, v),
    removeItem: (k: string) => void mockStore.delete(k),
  },
}));

import { getDraft, setDraft, clearDraft } from '../src/features/chat/draftStore';

const LOCAL_PROVENANCE = { scope: 'local' } as const;

beforeEach(() => mockStore.clear());

describe('draftStore', () => {
  it('round-trips a draft for a key', () => {
    setDraft('conv-1', 'half typed message', LOCAL_PROVENANCE);
    expect(getDraft('conv-1', LOCAL_PROVENANCE)).toBe('half typed message');
  });

  it('keeps drafts isolated per key', () => {
    setDraft('conv-1', 'one', LOCAL_PROVENANCE);
    setDraft('conv-2', 'two', LOCAL_PROVENANCE);
    expect(getDraft('conv-1', LOCAL_PROVENANCE)).toBe('one');
    expect(getDraft('conv-2', LOCAL_PROVENANCE)).toBe('two');
  });

  it('empty / whitespace text clears the draft (no orphan stored)', () => {
    setDraft('conv-1', 'something', LOCAL_PROVENANCE);
    setDraft('conv-1', '   ', LOCAL_PROVENANCE);
    expect(getDraft('conv-1', LOCAL_PROVENANCE)).toBe('');
    expect(mockStore.has('composer-draft:conv-1')).toBe(false);
  });

  it('clearDraft removes a saved draft (e.g. after send)', () => {
    setDraft('conv-1', 'about to send', LOCAL_PROVENANCE);
    clearDraft('conv-1', LOCAL_PROVENANCE);
    expect(getDraft('conv-1', LOCAL_PROVENANCE)).toBe('');
  });

  it('returns "" and is a no-op for an undefined key', () => {
    expect(getDraft(undefined, LOCAL_PROVENANCE)).toBe('');
    expect(() => setDraft(undefined, 'x')).not.toThrow();
    expect(() => clearDraft(undefined, LOCAL_PROVENANCE)).not.toThrow();
    expect(mockStore.size).toBe(0);
  });
});
