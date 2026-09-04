import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';

import {
  fetchConnectedConnectorIds,
  fetchConnectorRecord,
  fetchConnectorRecords,
  toConnectorDetail,
  toConnectorEntry,
  toConnectorSection,
  toCuratedConnectorDetail,
  toCuratedConnectorEntry,
  connectedConnectorIds,
} from '../services/connectors-directory';

afterEach(() => {
  vi.unstubAllGlobals();
});

function record(patch: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id: 'customerscore',
    name: 'Customerscore',
    publisher: 'Customerscore',
    description: 'Customer health insights',
    categories: ['Data'],
    remotes: [],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: ['list_customers'],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: 'https://cdn.invalid/icon.png',
    monogram: 'CU',
    documentationUrl: null,
    iconSource: 'registry',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...patch,
  };
}

describe('toConnectorEntry', () => {
  it('proxies the icon through the app rather than the third party url', () => {
    const entry = toConnectorEntry(record(), new Set());
    expect(entry.iconUrl).toBe('/api/connectors/directory/icon?id=customerscore');
  });

  it('falls back to the monogram when the record has no icon', () => {
    const entry = toConnectorEntry(record({ iconUrl: null }), new Set());
    expect(entry.iconUrl).toBeNull();
    expect(entry.monogram).toBe('CU');
  });

  it('maps each registry badge to its directory badge', () => {
    expect(toConnectorEntry(record({ badge: 'first-party' }), new Set()).badges).toEqual(['agi']);
    expect(toConnectorEntry(record({ badge: 'registry' }), new Set()).badges).toEqual(['verified']);
    expect(toConnectorEntry(record({ badge: 'community' }), new Set()).badges).toEqual([
      'community',
    ]);
  });

  it('marks a connector the account has already connected', () => {
    expect(toConnectorEntry(record(), new Set(['customerscore'])).installed).toBe(true);
    expect(toConnectorEntry(record(), new Set(['other'])).installed).toBe(false);
  });

  it('exposes availability and category as filterable facets', () => {
    expect(toConnectorEntry(record(), new Set()).facets).toEqual({
      availability: ['connect'],
      category: ['Data'],
    });
  });

  it('never invents an install count', () => {
    expect(toConnectorEntry(record(), new Set()).installCount).toBeUndefined();
  });
});

describe('toConnectorSection', () => {
  it('lists the heading and only the badges present in the snapshot', () => {
    const section = toConnectorSection(
      [record(), record({ id: 'gmail', badge: 'first-party' })],
      new Set(),
    );
    expect(section.sourcesHeading).toBe('AGI and partners');
    expect(section.sources?.map((source) => source.id)).toEqual(['first-party', 'community']);
  });

  it('hides a filter group with a single value', () => {
    const section = toConnectorSection([record()], new Set());
    expect(section.filterGroups).toEqual([]);
  });

  it('offers availability and category filters once the snapshot varies', () => {
    const section = toConnectorSection(
      [
        record(),
        record({ id: 'local', connectable: 'desktop-and-cli', categories: ['Productivity'] }),
      ],
      new Set(),
    );
    expect(section.filterGroups?.map((group) => group.id)).toEqual(['availability', 'category']);
    expect(section.filterGroups?.[0]?.options.map((option) => option.label)).toEqual([
      'Connect',
      'Desktop and CLI',
    ]);
  });

  it('offers name sort only, since the snapshot carries no dates or counts', () => {
    expect(toConnectorSection([record()], new Set()).sortOptions).toEqual(['name']);
  });

  it('declares connectors installable so the card offers Connect', () => {
    expect(toConnectorSection([record()], new Set()).installable).toBe(true);
  });
});

function curated(patch: Partial<import('@agiworkforce/ui').SettingsConnector> = {}) {
  return {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and send mail',
    category: 'Communication',
    authType: 'oauth',
    actionCount: 0,
    phase: 1,
    iconBg: 'bg-red-500',
    iconText: 'GM',
    canConnect: true,
    ...patch,
  } as import('@agiworkforce/ui').SettingsConnector;
}

describe('curated first party connectors', () => {
  it('renders a curated connector as a Popular entry made by AGI', () => {
    const entry = toCuratedConnectorEntry(curated(), new Set());
    expect(entry).toMatchObject({
      id: 'gmail',
      popular: true,
      badges: ['agi'],
      sourceId: 'first-party',
      installed: false,
      facets: { availability: ['connect'], category: ['Communication'] },
    });
  });

  it('marks a curated connector the account has connected', () => {
    expect(toCuratedConnectorEntry(curated(), new Set(['gmail'])).installed).toBe(true);
  });

  it('files an unconfigured curated connector under needs setup', () => {
    const entry = toCuratedConnectorEntry(curated({ canConnect: false }), new Set());
    expect(entry.facets?.['availability']).toEqual(['needs-setup']);
  });

  it('carries a real status label and never invents one', () => {
    expect(toCuratedConnectorEntry(curated(), new Set()).statusLabel).toBeUndefined();
    expect(
      toCuratedConnectorEntry(curated({ statusLabel: 'Needs setup by AGI' }), new Set())
        .statusLabel,
    ).toBe('Needs setup by AGI');
  });

  it('leads the section with curated entries and drops a registry duplicate', () => {
    const section = toConnectorSection(
      [record({ id: 'gmail' }), record()],
      new Set(),
      [curated()],
    );
    expect(section.entries.map((entry) => entry.id)).toEqual(['gmail', 'customerscore']);
    expect(section.entries[0]?.popular).toBe(true);
  });

  it('adds the AGI chip once a curated connector is present', () => {
    const section = toConnectorSection([record()], new Set(), [curated()]);
    expect(section.sources?.map((chip) => chip.id)).toEqual(['first-party', 'community']);
  });

  it('folds curated categories and availability into the filters', () => {
    const section = toConnectorSection([record()], new Set(), [curated()]);
    expect(section.filterGroups?.map((group) => group.id)).toEqual(['category']);
    expect(section.filterGroups?.[0]?.options.map((option) => option.value)).toEqual([
      'Communication',
      'Data',
    ]);
  });

  it('builds a detail for a curated connector with no registry record', () => {
    expect(toCuratedConnectorDetail(curated(), new Set(['gmail']))).toMatchObject({
      kind: 'connector',
      badge: 'agi',
      categories: ['Communication'],
      connected: true,
      connectable: true,
    });
  });

  it('reads the connected ids from the settings adapter rows', () => {
    expect(connectedConnectorIds([{ connectorId: 'gmail' }, { connectorId: 'slack' }])).toEqual(
      new Set(['gmail', 'slack']),
    );
  });
});

describe('toConnectorDetail', () => {
  it('carries the tools and the connected state', () => {
    const detail = toConnectorDetail(record(), new Set(['customerscore']));
    expect(detail).toMatchObject({
      kind: 'connector',
      badge: 'community',
      tools: ['list_customers'],
      connected: true,
      connectable: true,
    });
  });

  it('carries the anatomy the detail view renders', () => {
    const detail = toConnectorDetail(
      record({
        remotes: [{ url: 'https://mcp.invalid/v1', transport: 'streamable-http' }],
        authorName: 'Customerscore Inc',
        authorUrl: 'https://customerscore.invalid/about',
        websiteUrl: 'https://customerscore.invalid',
        documentationUrl: 'https://docs.invalid',
        supportUrl: 'https://support.invalid',
        privacyPolicyUrl: 'https://privacy.invalid',
      }),
      new Set(),
    );
    expect(detail).toMatchObject({
      publisher: 'Customerscore',
      publisherUrl: 'https://customerscore.invalid',
      authorName: 'Customerscore Inc',
      authorUrl: 'https://customerscore.invalid/about',
      connectorUrl: 'https://mcp.invalid/v1',
      documentationUrl: 'https://docs.invalid',
      supportUrl: 'https://support.invalid',
      privacyPolicyUrl: 'https://privacy.invalid',
      categories: ['Data'],
    });
  });

  it('falls back to the author link when the record has no website', () => {
    expect(
      toConnectorDetail(record({ authorUrl: 'https://author.invalid' }), new Set()).publisherUrl,
    ).toBe('https://author.invalid');
  });

  it('leaves the connector url null when the record lists no remote', () => {
    expect(toConnectorDetail(record({ remotes: [] }), new Set()).connectorUrl).toBeNull();
  });

  it('marks a desktop only connector as not connectable from the web', () => {
    expect(
      toConnectorDetail(record({ connectable: 'desktop-and-cli' }), new Set()).connectable,
    ).toBe(false);
    expect(toConnectorDetail(record({ connectable: 'needs-setup' }), new Set()).connectable).toBe(
      false,
    );
  });
});

describe('connector directory requests', () => {
  it('reads a page of directory records', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [record()], total: 1, nextCursor: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const records = await fetchConnectorRecords();
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/directory?limit=100', {
      cache: 'no-store',
    });
    expect(records).toHaveLength(1);
  });

  it('throws when the directory is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchConnectorRecords()).rejects.toThrow('connector directory failed: 503');
  });

  it('reads the connected ids keyed by connector id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ connectors: [{ connectorId: 'github' }] }),
      }),
    );
    expect(await fetchConnectedConnectorIds()).toEqual(new Set(['github']));
  });

  it('treats a signed out connected lookup as nothing connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await fetchConnectedConnectorIds()).toEqual(new Set());
  });

  it('encodes each id segment separately so a namespaced id keeps its path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: record() }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchConnectorRecord('io.github/owner name');
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/directory/io.github/owner%20name', {
      cache: 'no-store',
    });
  });

  it('returns null for a connector the directory does not hold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await fetchConnectorRecord('missing')).toBeNull();
  });
});
