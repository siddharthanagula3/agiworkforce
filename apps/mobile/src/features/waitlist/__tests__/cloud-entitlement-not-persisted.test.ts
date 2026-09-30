const mockWritten = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: (name: string) => mockWritten.get(name) ?? null,
    setItem: (name: string, value: string) => void mockWritten.set(name, value),
    removeItem: (name: string) => void mockWritten.delete(name),
  },
}));

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

    useWaitlistStore.getState().setCloudAccess(true);

    expect(mockWritten.size).toBe(0);
  });

  it('erases a legacy signup record, email and cloud grant included, on cold start', () => {
    mockWritten.set(
      'waitlist-store',
      JSON.stringify({
        state: {
          joined: true,
          email: 'a@b.com',
          rank: 9,
          cloudUnlocked: true,
          cloudUnlockedAt: '2026-01-01T00:00:00.000Z',
        },
        version: 0,
      }),
    );

    const state = loadStore().getState();

    expect(mockWritten.has('waitlist-store')).toBe(false);
    expect(state.cloudUnlocked).toBe(false);
    expect(state.cloudUnlockedAt).toBeUndefined();
    expect(state).not.toHaveProperty('email');
    expect(state).not.toHaveProperty('rank');
  });

  it('still unlocks cloud for the authenticated session in memory', () => {
    const useWaitlistStore = loadStore();

    useWaitlistStore.getState().setCloudAccess(true);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(true);

    useWaitlistStore.getState().setCloudAccess(false);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(false);
  });
});
