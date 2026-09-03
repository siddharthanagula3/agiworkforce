const mockWritten = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(
    (store: { persist: { rehydrate: () => void } }) => void store.persist.rehydrate(),
  ),
  mmkvStorage: {
    getItem: (name: string) => mockWritten.get(name) ?? null,
    setItem: (name: string, value: string) => void mockWritten.set(name, value),
    removeItem: (name: string) => void mockWritten.delete(name),
  },
}));

function seedPersistedBlob(state: Record<string, unknown>): void {
  mockWritten.set('waitlist-store', JSON.stringify({ state, version: 0 }));
}

function loadStore() {
  let store!: typeof import('../store').useWaitlistStore;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules needs a synchronous require
    store = require('../store').useWaitlistStore;
  });
  return store;
}

beforeEach(() => {
  mockWritten.clear();
});

describe('waitlist store, managed-cloud entitlement is session-only', () => {
  it('never writes the cloud grant to device storage', () => {
    const useWaitlistStore = loadStore();

    useWaitlistStore.getState().markJoined({ email: 'a@b.com', country: 'US' }, { rank: 4 });
    useWaitlistStore.getState().setCloudAccess(true);

    const persisted = JSON.parse(mockWritten.get('waitlist-store') as string).state;

    expect(persisted.joined).toBe(true);
    expect(persisted.rank).toBe(4);
    expect(persisted).not.toHaveProperty('cloudUnlocked');
    expect(persisted).not.toHaveProperty('cloudUnlockedAt');
    expect(persisted).not.toHaveProperty('inviteId');
    expect(persisted).not.toHaveProperty('inviteCode');
  });

  it('does not restore a legacy persisted cloud grant on cold start', () => {
    seedPersistedBlob({
      joined: true,
      email: 'a@b.com',
      rank: 9,
      cloudUnlocked: true,
      cloudUnlockedAt: '2026-01-01T00:00:00.000Z',
      inviteId: 'mobile-alpha-tester',
      inviteCode: 'ALPHATESTER',
    });

    const state = loadStore().getState();

    expect(state.joined).toBe(true);
    expect(state.rank).toBe(9);
    expect(state.cloudUnlocked).toBe(false);
    expect(state.cloudUnlockedAt).toBeUndefined();
    expect(state.inviteId).toBeUndefined();
    expect(state.inviteCode).toBeUndefined();
  });

  it('still unlocks cloud for the authenticated session in memory', () => {
    const useWaitlistStore = loadStore();

    useWaitlistStore.getState().setCloudAccess(true);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(true);

    useWaitlistStore.getState().setCloudAccess(false);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(false);
  });
});
