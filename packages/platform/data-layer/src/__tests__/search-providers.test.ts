import { describe, expect, it } from 'vitest';

import { createProviderRegistry, type SearchResponse, type SearchStorageProvider } from '../search';

const EMPTY_RESPONSE: SearchResponse = { hits: [], semantic: 'unavailable' };

describe('SearchStorageProvider', () => {
  it('is a named SearchProvider, so the index behind a search is swappable', async () => {
    const storage: SearchStorageProvider = {
      id: 'postgres',
      search: async () => EMPTY_RESPONSE,
    };
    const registry = createProviderRegistry<SearchStorageProvider>([storage]);
    expect(registry.get('postgres')).toBe(storage);
    await expect(registry.get('postgres')!.search({ text: 'a', limit: 1 })).resolves.toEqual(
      EMPTY_RESPONSE,
    );
  });
});

describe('createProviderRegistry', () => {
  it('replaces an id in place rather than answering to it twice', () => {
    const first: SearchStorageProvider = { id: 'index', search: async () => EMPTY_RESPONSE };
    const second: SearchStorageProvider = { id: 'index', search: async () => EMPTY_RESPONSE };
    const registry = createProviderRegistry<SearchStorageProvider>([first]);
    registry.register(second);
    expect(registry.list()).toEqual([second]);
  });

  it('keeps registration order, which is the order a fallback chain tries', () => {
    const registry = createProviderRegistry<SearchStorageProvider>();
    for (const id of ['primary', 'secondary', 'tertiary']) {
      registry.register({ id, search: async () => EMPTY_RESPONSE });
    }
    expect(registry.ids()).toEqual(['primary', 'secondary', 'tertiary']);
  });
});
