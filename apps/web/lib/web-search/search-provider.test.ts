import { afterEach, describe, expect, it } from 'vitest';

import {
  configuredWebSearchProviders,
  registerWebSearchProvider,
  unregisterWebSearchProvider,
  webSearchProviderDescriptors,
  webSearchProviderHosts,
  webSearchSources,
  type WebSearchProvider,
} from './search-provider';

const RETRIEVED_AT = '2026-09-18T12:00:00.000Z';

function fakeProvider(overrides: Partial<WebSearchProvider> & { id: string }): WebSearchProvider {
  return {
    delivery: 'indexed',
    isConfigured: () => true,
    search: async () => ({ ok: true, items: [] }),
    ...overrides,
  };
}

const registered: string[] = [];

function register(provider: WebSearchProvider): WebSearchProvider {
  registerWebSearchProvider(provider);
  registered.push(provider.id);
  return provider;
}

afterEach(() => {
  while (registered.length > 0) unregisterWebSearchProvider(registered.pop()!);
});

describe('web search provider descriptors', () => {
  it('declares every provider with a host, a key env and a delivery tag', () => {
    const descriptors = webSearchProviderDescriptors();
    expect(descriptors.length).toBeGreaterThan(0);
    for (const descriptor of descriptors) {
      expect(descriptor.id).not.toBe('');
      expect(descriptor.host).toBe(descriptor.host.toLowerCase());
      expect(descriptor.apiKeyEnv).toMatch(/^[A-Z0-9_]+$/);
      expect(['live', 'cached', 'indexed', 'external']).toContain(descriptor.delivery);
    }
  });

  it('exposes every declared host, which is what the egress policy allowlists', () => {
    for (const descriptor of webSearchProviderDescriptors()) {
      expect(webSearchProviderHosts()).toContain(descriptor.host);
    }
  });

  it('adds a runtime-registered provider host to the same list', () => {
    register(fakeProvider({ id: 'test-extra', host: 'search.test' }));
    expect(webSearchProviderHosts()).toContain('search.test');
  });
});

describe('configuredWebSearchProviders', () => {
  it('lists declared providers before ones registered at runtime', () => {
    const declared = webSearchProviderDescriptors()[0]!.id;
    register(fakeProvider({ id: 'test-extra' }));
    register(fakeProvider({ id: declared }));
    const ids = configuredWebSearchProviders({ apiKey: 'k' }).map((provider) => provider.id);
    expect(ids).toEqual([declared, 'test-extra']);
  });

  it('skips a provider that has no key', () => {
    register(fakeProvider({ id: 'test-unconfigured', isConfigured: () => false }));
    expect(configuredWebSearchProviders({ apiKey: 'k' }).map((p) => p.id)).not.toContain(
      'test-unconfigured',
    );
  });
});

describe('webSearchSources', () => {
  it('gives every result a stable id, a provider and a delivery tag', () => {
    const provider = register(fakeProvider({ id: 'test-indexed', delivery: 'indexed' }));
    const [source] = webSearchSources({
      providerId: provider.id,
      retrievedAt: RETRIEVED_AT,
      results: [
        {
          url: 'https://example.com/story',
          title: 'Story',
          snippet: 'summary',
          date: '2026-09-16T00:00:00.000Z',
        },
      ],
      now: new Date(RETRIEVED_AT),
    });

    expect(source!.id).toMatch(/^src_[0-9a-f]{16}$/);
    expect(source!.contentVersion).toMatch(/^v1_[0-9a-f]{16}$/);
    expect(source!.provenance).toMatchObject({
      providerId: 'test-indexed',
      retrievedAt: RETRIEVED_AT,
      delivery: 'indexed',
    });
    expect(source!.provenance.freshness.class).toBe('fresh');
  });

  it('never tags an indexed provider result as live', () => {
    const provider = register(fakeProvider({ id: 'test-indexed-2', delivery: 'indexed' }));
    const [source] = webSearchSources({
      providerId: provider.id,
      retrievedAt: RETRIEVED_AT,
      results: [{ url: 'https://example.com/a' }],
    });
    expect(source!.provenance.delivery).toBe('indexed');
  });

  it('collapses the same page returned twice in one response', () => {
    const provider = register(fakeProvider({ id: 'test-dedupe' }));
    const sources = webSearchSources({
      providerId: provider.id,
      retrievedAt: RETRIEVED_AT,
      results: [
        { url: 'https://www.example.com/story/', title: 'One' },
        { url: 'http://example.com/story?utm_source=x', title: 'Two' },
      ],
    });
    expect(sources).toHaveLength(1);
  });

  it('falls back to external delivery for a provider nothing declares', () => {
    const [source] = webSearchSources({
      providerId: 'not-registered',
      retrievedAt: RETRIEVED_AT,
      results: [{ url: 'https://example.com/a' }],
    });
    expect(source!.provenance.delivery).toBe('external');
  });
});
