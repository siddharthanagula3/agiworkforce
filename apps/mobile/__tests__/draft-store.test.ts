const mockStore = new Map<string, string>();
const mockAccountStore = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (k: string) => mockAccountStore.get(k),
    set: (k: string, v: string) => void mockAccountStore.set(k, v),
    delete: (k: string) => void mockAccountStore.delete(k),
  },
  mmkvStorage: {
    getItem: (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: (k: string, v: string) => void mockStore.set(k, v),
    removeItem: (k: string) => void mockStore.delete(k),
  },
}));

import {
  getDraft,
  getDraftAttachments,
  setDraft,
  clearDraft,
} from '../src/features/chat/draftStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

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

describe('a draft the OS interrupts', () => {
  it('is already on disk when the process is killed mid sentence', () => {
    setDraft('conv-1', 'half a thoug', { scope: 'local' });
    setDraft('conv-1', 'half a thought', { scope: 'local' });

    jest.resetModules();
    const reloaded =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/features/chat/draftStore') as typeof import('../src/features/chat/draftStore');

    expect(reloaded.getDraft('conv-1', { scope: 'local' })).toBe('half a thought');
  });
});

describe('files kept with a draft', () => {
  const photo = {
    id: 'photo-1',
    uri: 'file:///cache/IMG_0001.jpg',
    mimeType: 'image/jpeg',
    fileName: 'IMG_0001.jpg',
    fileSize: 2048,
    width: 640,
    height: 480,
  };

  beforeEach(() => {
    mockAccountStore.clear();
    __resetCloudAccountSessionForTests();
  });

  it('come back with the draft, without send or availability marks', () => {
    setDraft('conv-1', '', LOCAL_PROVENANCE, [{ ...photo, sendFailed: true, unavailable: true }]);

    expect(getDraftAttachments('conv-1', LOCAL_PROVENANCE)).toEqual([photo]);
  });

  it('an uploaded Cloud file comes back as uploaded for the same account only', () => {
    activateCloudAccount('owner-a');
    const cloud = { scope: 'cloud', ownerId: 'owner-a' } as const;
    setDraft('conv-1', 'look', cloud, [{ ...photo, assetId: 'asset-1' }]);

    expect(getDraftAttachments('conv-1', cloud)).toEqual([{ ...photo, assetId: 'asset-1' }]);

    activateCloudAccount('owner-b');
    expect(getDraftAttachments('conv-1', cloud)).toEqual([]);
    expect(getDraftAttachments('conv-1', { scope: 'cloud', ownerId: 'owner-b' })).toEqual([]);
  });

  it('a Local draft never shows the Cloud draft of the same key, or the reverse', () => {
    activateCloudAccount('owner-a');
    const cloud = { scope: 'cloud', ownerId: 'owner-a' } as const;
    setDraft('new-chat', '', cloud, [{ ...photo, assetId: 'asset-1' }]);
    setDraft('new-chat', '', LOCAL_PROVENANCE, [{ ...photo, id: 'photo-local' }]);

    expect(getDraftAttachments('new-chat', LOCAL_PROVENANCE).map((item) => item.id)).toEqual([
      'photo-local',
    ]);
    expect(getDraftAttachments('new-chat', cloud).map((item) => item.id)).toEqual(['photo-1']);
  });

  it('a Local draft drops a file that carries a Cloud upload', () => {
    setDraft('conv-1', 'hi', LOCAL_PROVENANCE, [
      { ...photo, assetId: 'asset-1' },
      { ...photo, id: 'photo-2' },
    ]);

    expect(getDraftAttachments('conv-1', LOCAL_PROVENANCE).map((item) => item.id)).toEqual([
      'photo-2',
    ]);
  });

  it('a draft of files alone is kept, and removing the last file removes the draft', () => {
    setDraft('conv-1', '', LOCAL_PROVENANCE, [photo]);
    expect(mockStore.size).toBe(1);

    setDraft('conv-1', '', LOCAL_PROVENANCE, []);
    expect(mockStore.size).toBe(0);
    expect(getDraftAttachments('conv-1', LOCAL_PROVENANCE)).toEqual([]);
  });
});
