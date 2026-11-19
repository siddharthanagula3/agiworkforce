const mockStore = new Map<string, string>();

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => void mockStore.set(key, value),
    delete: (key: string) => void mockStore.delete(key),
    getAllKeys: () => [...mockStore.keys()],
  },
}));

import {
  RECENT_SEARCH_LIMIT,
  clearCloudRecentSearches,
  clearRecentSearches,
  readRecentSearches,
  recordRecentSearch,
} from '../src/features/search';

const LOCAL = { mode: 'local' } as const;
const ACCOUNT_A = { mode: 'cloud', ownerId: 'account-a' } as const;
const ACCOUNT_B = { mode: 'cloud', ownerId: 'account-b' } as const;

describe('recent searches', () => {
  beforeEach(() => mockStore.clear());

  it('lists the newest query first and keeps only the last five', () => {
    for (const query of ['one', 'two', 'three', 'four', 'five', 'six']) {
      recordRecentSearch(LOCAL, query);
    }
    expect(RECENT_SEARCH_LIMIT).toBe(5);
    expect(readRecentSearches(LOCAL)).toEqual(['six', 'five', 'four', 'three', 'two']);
  });

  it('moves a repeated query to the top instead of listing it twice', () => {
    recordRecentSearch(LOCAL, 'launch');
    recordRecentSearch(LOCAL, 'budget');
    recordRecentSearch(LOCAL, '  Launch  ');
    expect(readRecentSearches(LOCAL)).toEqual(['Launch', 'budget']);
  });

  it('ignores a blank query', () => {
    recordRecentSearch(LOCAL, '   ');
    expect(readRecentSearches(LOCAL)).toEqual([]);
    expect(mockStore.size).toBe(0);
  });

  it('keeps Local and each Cloud account separate', () => {
    recordRecentSearch(LOCAL, 'on device');
    recordRecentSearch(ACCOUNT_A, 'account a only');
    recordRecentSearch(ACCOUNT_B, 'account b only');

    expect(readRecentSearches(LOCAL)).toEqual(['on device']);
    expect(readRecentSearches(ACCOUNT_A)).toEqual(['account a only']);
    expect(readRecentSearches(ACCOUNT_B)).toEqual(['account b only']);
  });

  it('records nothing and reads nothing without a scope', () => {
    expect(recordRecentSearch(null, 'launch')).toEqual([]);
    expect(readRecentSearches(null)).toEqual([]);
    expect(mockStore.size).toBe(0);
  });

  it('clears only the list it is given', () => {
    recordRecentSearch(LOCAL, 'on device');
    recordRecentSearch(ACCOUNT_A, 'account a only');

    clearRecentSearches(ACCOUNT_A);

    expect(readRecentSearches(ACCOUNT_A)).toEqual([]);
    expect(readRecentSearches(LOCAL)).toEqual(['on device']);
  });

  it('removes every Cloud account list and keeps the Local list', () => {
    recordRecentSearch(LOCAL, 'on device');
    recordRecentSearch(ACCOUNT_A, 'account a only');
    recordRecentSearch(ACCOUNT_B, 'account b only');
    mockStore.set('unrelated-key', 'kept');

    clearCloudRecentSearches();

    expect(readRecentSearches(ACCOUNT_A)).toEqual([]);
    expect(readRecentSearches(ACCOUNT_B)).toEqual([]);
    expect(readRecentSearches(LOCAL)).toEqual(['on device']);
    expect(mockStore.get('unrelated-key')).toBe('kept');
  });

  it('reads a damaged stored value as an empty list', () => {
    recordRecentSearch(LOCAL, 'launch');
    const [key] = [...mockStore.keys()];
    mockStore.set(key!, '{not json');
    expect(readRecentSearches(LOCAL)).toEqual([]);
    mockStore.set(key!, JSON.stringify({ not: 'a list' }));
    expect(readRecentSearches(LOCAL)).toEqual([]);
    mockStore.set(key!, JSON.stringify(['kept', 4, '', null]));
    expect(readRecentSearches(LOCAL)).toEqual(['kept']);
  });
});
