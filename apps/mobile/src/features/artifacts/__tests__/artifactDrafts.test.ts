const mockStore = new Map<string, string>();
let mockOwnerId: string | null = null;

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStore.set(key, value),
    removeItem: (key: string) => void mockStore.delete(key),
  },
  storage: { getAllKeys: () => [...mockStore.keys()] },
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => (mockOwnerId ? { ownerId: mockOwnerId } : null),
}));

import {
  clearAccountScopedArtifactDrafts,
  discardArtifactDraft,
  keepArtifactDraft,
  readArtifactDraft,
} from '../artifactDrafts';

const LOCAL = { scope: 'local' } as const;
const CLOUD_A = { scope: 'cloud', ownerId: 'user-a' } as const;
const CLOUD_B = { scope: 'cloud', ownerId: 'user-b' } as const;

beforeEach(() => {
  mockStore.clear();
  mockOwnerId = null;
});

describe('kept artifact drafts', () => {
  it('keeps an unsaved edit with the text it started from and gives it back', () => {
    keepArtifactDraft('artifact-1', LOCAL, { base: '# Plan', content: '# Plan, revised' });

    expect(readArtifactDraft('artifact-1', LOCAL)).toEqual({
      base: '# Plan',
      content: '# Plan, revised',
    });
    expect(readArtifactDraft('artifact-2', LOCAL)).toBeNull();
  });

  it('forgets the draft when the text goes back to where it started or is discarded', () => {
    keepArtifactDraft('artifact-1', LOCAL, { base: 'a', content: 'b' });
    keepArtifactDraft('artifact-1', LOCAL, { base: 'a', content: 'a' });
    expect(readArtifactDraft('artifact-1', LOCAL)).toBeNull();

    keepArtifactDraft('artifact-1', LOCAL, { base: 'a', content: 'c' });
    discardArtifactDraft('artifact-1', LOCAL);
    expect(readArtifactDraft('artifact-1', LOCAL)).toBeNull();
  });

  it('shows a Cloud draft only to the account that wrote it', () => {
    mockOwnerId = 'user-a';
    keepArtifactDraft('artifact-1', CLOUD_A, { base: 'a', content: 'mine' });

    mockOwnerId = 'user-b';
    expect(readArtifactDraft('artifact-1', CLOUD_A)).toBeNull();
    expect(readArtifactDraft('artifact-1', CLOUD_B)).toBeNull();
    keepArtifactDraft('artifact-1', CLOUD_A, { base: 'a', content: 'not mine' });

    mockOwnerId = 'user-a';
    expect(readArtifactDraft('artifact-1', CLOUD_A)?.content).toBe('mine');
  });

  it('keeps nothing for an artifact without a valid account scope', () => {
    keepArtifactDraft('artifact-1', undefined, { base: 'a', content: 'b' });
    keepArtifactDraft('artifact-1', { scope: 'cloud', ownerId: ' ' }, { base: 'a', content: 'b' });
    expect(mockStore.size).toBe(0);
  });

  it('clears Cloud drafts and unreadable records at sign-out and keeps Local ones', () => {
    mockOwnerId = 'user-a';
    keepArtifactDraft('local-1', LOCAL, { base: 'a', content: 'local text' });
    keepArtifactDraft('cloud-1', CLOUD_A, { base: 'a', content: 'cloud text' });
    mockStore.set('artifact-draft:v1:local:broken', '{not json');
    mockStore.set('composer-draft:v1:local:chat', 'untouched');

    clearAccountScopedArtifactDrafts();

    expect(readArtifactDraft('local-1', LOCAL)?.content).toBe('local text');
    expect(readArtifactDraft('cloud-1', CLOUD_A)).toBeNull();
    expect(mockStore.has('artifact-draft:v1:local:broken')).toBe(false);
    expect(mockStore.get('composer-draft:v1:local:chat')).toBe('untouched');
  });
});
