const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

import { useCodePreferences } from '../src/features/settings/code/store';

const KEY = 'code-preferences';

function stored(): Record<string, unknown> {
  return JSON.parse(mockStorage.get(KEY) ?? '{}').state;
}

describe('the AGI Code list grouping preference', () => {
  beforeEach(() => {
    mockStorage.clear();
    useCodePreferences.setState({ groupSessionsByRepository: false });
  });

  it('starts as a flat list', () => {
    expect(useCodePreferences.getInitialState().groupSessionsByRepository).toBe(false);
  });

  it('is written to storage when it changes', () => {
    useCodePreferences.getState().setGroupSessionsByRepository(true);

    expect(stored().groupSessionsByRepository).toBe(true);
  });

  it('comes back after the app restarts', async () => {
    useCodePreferences.getState().setGroupSessionsByRepository(true);
    const saved = mockStorage.get(KEY) ?? '';
    useCodePreferences.setState({ groupSessionsByRepository: false });
    mockStorage.set(KEY, saved);

    await useCodePreferences.persist.rehydrate();

    expect(useCodePreferences.getState().groupSessionsByRepository).toBe(true);
  });

  it('ignores a saved value that is not a boolean', async () => {
    mockStorage.set(
      KEY,
      JSON.stringify({ state: { groupSessionsByRepository: 'yes' }, version: 0 }),
    );

    await useCodePreferences.persist.rehydrate();

    expect(useCodePreferences.getState().groupSessionsByRepository).toBe(false);
  });
});
