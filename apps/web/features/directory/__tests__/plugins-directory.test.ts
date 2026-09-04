import type {
  PluginMarketplaceEntry,
  PluginMarketplaceSourceSummary,
} from '@agiworkforce/cloud-contracts';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPluginSnapshot,
  isRecentlyAdded,
  toMarketplaceDetail,
  toMarketplaceDirectoryEntry,
  toPluginSection,
  toRegistryDetail,
  toRegistryEntry,
  type PluginDirectorySnapshot,
} from '../services/plugins-directory';

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = Date.parse('2026-09-03T00:00:00.000Z');
const DAY = 86_400_000;

function registry(patch: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    id: 'productivity',
    name: 'Productivity',
    version: '1.0.0',
    description: 'Manage tasks',
    category: 'productivity',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
    source: 'builtin',
    status: 'published',
    webInstallable: true,
    declaredSkills: [],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: ['Catch me up'],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: 'https://example.invalid/productivity',
    installCount: 2400,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...patch,
  } as PluginRegistryEntry;
}

function marketplaceEntry(patch: Partial<PluginMarketplaceEntry> = {}): PluginMarketplaceEntry {
  return {
    id: 'entry-1',
    sourceId: 'source-1',
    pluginKey: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews pull requests',
    version: '0.1.0',
    declaredSkills: [],
    requiredConnectors: [],
    agents: [],
    examplePrompts: ['Review this branch'],
    permissions: [],
    contentHash: 'abc',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

function source(
  patch: Partial<PluginMarketplaceSourceSummary> = {},
): PluginMarketplaceSourceSummary {
  return {
    id: 'source-1',
    name: 'Example marketplace',
    repositoryUrl: 'https://github.com/example/plugins',
    ref: null,
    status: 'active',
    lastError: null,
    contentHash: 'abc',
    entryCount: 1,
    lastSyncedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

function snapshot(patch: Partial<PluginDirectorySnapshot> = {}): PluginDirectorySnapshot {
  return {
    registry: [registry()],
    marketplaceEntries: [],
    marketplaceSources: [],
    installedPluginIds: new Set(),
    installedEntryIds: new Set(),
    marketplacesAvailable: true,
    ...patch,
  };
}

describe('isRecentlyAdded', () => {
  it('marks an entry added inside the window', () => {
    expect(isRecentlyAdded(new Date(NOW - 5 * DAY).toISOString(), NOW)).toBe(true);
  });

  it('does not mark an older entry, a missing date or an unparsable one', () => {
    expect(isRecentlyAdded(new Date(NOW - 31 * DAY).toISOString(), NOW)).toBe(false);
    expect(isRecentlyAdded(undefined, NOW)).toBe(false);
    expect(isRecentlyAdded('not a date', NOW)).toBe(false);
  });
});

describe('toRegistryEntry', () => {
  it('carries the real publisher, count and dates', () => {
    const entry = toRegistryEntry(registry(), new Set(), NOW);
    expect(entry).toMatchObject({
      id: 'productivity',
      publisher: 'AGI',
      sourceId: 'agi',
      installCount: 2400,
      updatedAt: '2026-09-02T00:00:00.000Z',
      isNew: true,
      installed: false,
      facets: { status: ['not-installed'] },
    });
  });

  it('omits the count when the catalog did not compute one', () => {
    const entry = toRegistryEntry(registry({ installCount: undefined }), new Set(), NOW);
    expect('installCount' in entry).toBe(false);
  });

  it('files a third party plugin under partners', () => {
    const entry = toRegistryEntry(
      registry({ publisher: { id: 'acme', name: 'Acme', kind: 'third-party', url: null } }),
      new Set(),
      NOW,
    );
    expect(entry.sourceId).toBe('partners');
    expect(entry.badges).toBeUndefined();
  });

  it('flips the status facet once installed', () => {
    const entry = toRegistryEntry(registry(), new Set(['productivity']), NOW);
    expect(entry.installed).toBe(true);
    expect(entry.facets).toEqual({ status: ['installed'] });
  });
});

describe('toMarketplaceDirectoryEntry', () => {
  it('files the entry under its marketplace source', () => {
    const entry = toMarketplaceDirectoryEntry(marketplaceEntry(), new Set(['entry-1']), NOW);
    expect(entry).toMatchObject({ sourceId: 'source-1', installed: true });
    expect(entry.installCount).toBeUndefined();
  });
});

describe('toPluginSection', () => {
  it('lists AGI, partners and every synced marketplace as chips', () => {
    const section = toPluginSection(
      snapshot({
        registry: [
          registry(),
          registry({
            id: 'acme',
            publisher: { id: 'acme', name: 'Acme', kind: 'third-party', url: null },
          }),
        ],
        marketplaceEntries: [marketplaceEntry()],
        marketplaceSources: [source()],
      }),
      NOW,
    );
    expect(section.sources?.map((chip) => chip.id)).toEqual(['agi', 'partners', 'source-1']);
  });

  it('hides the status filter until both states exist', () => {
    expect(toPluginSection(snapshot(), NOW).filterGroups).toEqual([]);
    const mixed = toPluginSection(
      snapshot({
        registry: [registry(), registry({ id: 'other' })],
        installedPluginIds: new Set(['other']),
      }),
      NOW,
    );
    expect(mixed.filterGroups?.[0]?.id).toBe('status');
  });

  it('declares plugins installable so the card offers Install', () => {
    expect(toPluginSection(snapshot(), NOW).installable).toBe(true);
  });

  it('offers the popular sort only when a real count exists', () => {
    expect(toPluginSection(snapshot(), NOW).sortOptions).toEqual(['popular', 'updated', 'name']);
    const countless = toPluginSection(
      snapshot({ registry: [registry({ installCount: undefined })] }),
      NOW,
    );
    expect(countless.sortOptions).toEqual(['updated', 'name']);
  });
});

describe('plugin detail mapping', () => {
  it('prefers the homepage as the plugin source link', () => {
    expect(toRegistryDetail(registry(), new Set()).sourceUrl).toBe(
      'https://example.invalid/productivity',
    );
  });

  it('falls back to the publisher url and then to null', () => {
    expect(
      toRegistryDetail(
        registry({
          homepageUrl: null,
          publisher: { id: 'acme', name: 'Acme', kind: 'third-party', url: 'https://acme.invalid' },
        }),
        new Set(),
      ).sourceUrl,
    ).toBe('https://acme.invalid');
    expect(toRegistryDetail(registry({ homepageUrl: null }), new Set()).sourceUrl).toBeNull();
  });

  it('marks a plugin the web cannot install', () => {
    expect(toRegistryDetail(registry({ webInstallable: false }), new Set()).installable).toBe(
      false,
    );
  });

  it('uses the marketplace repository as the source link', () => {
    const detail = toMarketplaceDetail(marketplaceEntry(), source(), new Set(['entry-1']));
    expect(detail).toMatchObject({
      publisher: 'Example marketplace',
      sourceUrl: 'https://github.com/example/plugins',
      installed: true,
      examplePrompts: ['Review this branch'],
    });
  });
});

describe('fetchPluginSnapshot', () => {
  function stubRoutes(overrides: Record<string, { ok: boolean; body?: unknown }> = {}) {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      const route = overrides[path.split('?')[0] ?? ''];
      if (route && !route.ok) return Promise.resolve({ ok: false, status: 500 });
      const body = route?.body ?? {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('merges the catalog, marketplaces and both installation lists', async () => {
    stubRoutes({
      '/api/plugins': { ok: true, body: { entries: [registry()] } },
      '/api/plugins/installations': {
        ok: true,
        body: { installations: [{ pluginId: 'productivity', enabled: true }] },
      },
      '/api/plugins/marketplaces/entries': { ok: true, body: { entries: [marketplaceEntry()] } },
      '/api/plugins/marketplaces': { ok: true, body: { sources: [source()] } },
      '/api/plugins/marketplace-installations': {
        ok: true,
        body: { installations: [{ entryId: 'entry-1' }] },
      },
    });

    const result = await fetchPluginSnapshot();

    expect(result.registry).toHaveLength(1);
    expect(result.marketplaceEntries).toHaveLength(1);
    expect(result.marketplaceSources).toHaveLength(1);
    expect(result.installedPluginIds).toEqual(new Set(['productivity']));
    expect(result.installedEntryIds).toEqual(new Set(['entry-1']));
  });

  it('still renders the catalog when the per user routes are unavailable', async () => {
    stubRoutes({
      '/api/plugins': { ok: true, body: { entries: [registry()] } },
      '/api/plugins/installations': { ok: false },
      '/api/plugins/marketplaces/entries': { ok: false },
      '/api/plugins/marketplaces': { ok: false },
      '/api/plugins/marketplace-installations': { ok: false },
    });

    const result = await fetchPluginSnapshot();

    expect(result.registry).toHaveLength(1);
    expect(result.installedPluginIds.size).toBe(0);
    expect(result.marketplaceSources).toEqual([]);
  });

  it('survives a marketplace route that refuses the connection', async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.startsWith('/api/plugins?'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [registry()] }) });
      return Promise.reject(new Error('connection refused'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPluginSnapshot();

    expect(result.registry).toHaveLength(1);
    expect(result.marketplacesAvailable).toBe(false);
  });

  it('throws when the catalog itself fails', async () => {
    stubRoutes({ '/api/plugins': { ok: false } });
    await expect(fetchPluginSnapshot()).rejects.toThrow('plugin catalog failed: 500');
  });
});
