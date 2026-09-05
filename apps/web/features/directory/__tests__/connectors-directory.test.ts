import { afterEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_CONNECTORS } from '@features/settings/components/WebSettingsModal';
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

  it('never labels a vendor connector as made by AGI', () => {
    for (const badge of ['first-party', 'registry', 'community'] as const) {
      expect(toConnectorEntry(record({ badge }), new Set()).badges).not.toContain('agi');
    }
  });

  it('maps each source tier to its directory badge', () => {
    expect(toConnectorEntry(record({ badge: 'first-party' }), new Set()).badges).toEqual([
      'verified',
    ]);
    expect(toConnectorEntry(record({ badge: 'registry' }), new Set()).badges).toEqual([
      'community',
    ]);
    expect(toConnectorEntry(record({ badge: 'community' }), new Set()).badges).toEqual([
      'community',
    ]);
  });

  it('never promotes a registry listing to verified', () => {
    expect(toConnectorEntry(record({ badge: 'registry' }), new Set()).badges).not.toContain(
      'verified',
    );
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
  it('lists an All tab plus only the badges present in the snapshot', () => {
    const section = toConnectorSection(
      [record(), record({ id: 'gmail', badge: 'first-party' })],
      new Set(),
    );
    expect(section.sourcesHeading).toBeUndefined();
    expect(section.sources?.map((source) => source.id)).toEqual([
      'all',
      'first-party',
      'community',
    ]);
    expect(section.sources?.map((source) => source.label)).toEqual([
      'All',
      'Built by AGI',
      'Community',
    ]);
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
  it('renders a curated connector as a Popular verified entry', () => {
    const entry = toCuratedConnectorEntry(curated(), new Set());
    expect(entry).toMatchObject({
      id: 'gmail',
      popular: true,
      badges: ['verified'],
      sourceId: 'first-party',
      installed: false,
      facets: { availability: ['connect'], category: ['Communication'] },
    });
  });

  it('never labels a vendor connector as made by AGI', () => {
    const adobe = curated({ id: 'adobe', name: 'Adobe Creative Cloud', publisher: 'Adobe' });
    expect(toCuratedConnectorEntry(adobe, new Set()).badges).not.toContain('agi');
    expect(toCuratedConnectorDetail(adobe, new Set()).badge).not.toBe('agi');
  });

  it('badges a connector the account added by url as theirs, never verified', () => {
    const custom = curated({ id: 'custom-1', name: 'My server', authType: 'custom_mcp' });
    expect(toCuratedConnectorEntry(custom, new Set()).badges).toEqual(['yours']);
    expect(toCuratedConnectorDetail(custom, new Set()).badge).toBe('yours');
  });

  it('names the brand so the card renders the official mark', () => {
    expect(toCuratedConnectorEntry(curated(), new Set()).brandId).toBe('gmail');
    expect(toCuratedConnectorDetail(curated(), new Set()).brandId).toBe('gmail');
  });

  it('carries the vendor onto the publisher line', () => {
    const entry = toCuratedConnectorEntry(curated({ publisher: 'Google' }), new Set());
    expect(entry.publisher).toBe('Google');
    expect(toCuratedConnectorDetail(curated({ publisher: 'Google' }), new Set()).publisher).toBe(
      'Google',
    );
  });

  it('describes what the connector does rather than whether it is available', () => {
    const entry = toCuratedConnectorEntry(
      curated({ description: 'Email search, reading, sending, and drafts.' }),
      new Set(),
    );
    expect(entry.description).toBe('Email search, reading, sending, and drafts.');
    expect(entry.description).not.toMatch(/available|operator can connect/i);
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
      toCuratedConnectorEntry(curated({ statusLabel: 'Not connected' }), new Set()).statusLabel,
    ).toBe('Not connected');
  });

  it('leads the section with curated entries and drops a registry duplicate', () => {
    const section = toConnectorSection([record({ id: 'gmail' }), record()], new Set(), [curated()]);
    expect(section.entries.map((entry) => entry.id)).toEqual(['gmail', 'customerscore']);
    expect(section.entries[0]?.popular).toBe(true);
  });

  it('adds the AGI chip once a curated connector is present', () => {
    const section = toConnectorSection([record()], new Set(), [curated()]);
    expect(section.sources?.map((chip) => chip.id)).toEqual(['all', 'first-party', 'community']);
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
      badge: 'verified',
      categories: ['Communication'],
      connected: true,
      connectable: true,
    });
  });

  it('reads the connector url, documentation and tools from the first party source', () => {
    const detail = toCuratedConnectorDetail(curated({ publisher: 'Gmail' }), new Set());
    expect(detail.connectorUrl).toBe('https://gmailmcp.googleapis.com/mcp/v1');
    expect(detail.documentationUrl).toBe(
      'https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server',
    );
    expect(detail.websiteUrl).toBe('https://developers.google.com');
    expect(detail.authorName).toBe('Gmail');
    expect(detail.tools).toContain('search_threads');
  });

  it('renders fewer rows for a curated connector the first party source omits', () => {
    const detail = toCuratedConnectorDetail(
      curated({ id: 'adobe', name: 'Adobe Creative Cloud' }),
      new Set(),
    );
    expect(detail.connectorUrl).toBeNull();
    expect(detail.documentationUrl).toBeNull();
    expect(detail.websiteUrl).toBeNull();
    expect(detail.tools).toEqual([]);
  });

  it('hides tools when the first party source knows none', () => {
    expect(
      toCuratedConnectorDetail(curated({ id: 'slack', name: 'Slack' }), new Set()).tools,
    ).toEqual([]);
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
      websiteUrl: 'https://customerscore.invalid',
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

describe('settings connector projection', () => {
  function projected(id: string) {
    return SETTINGS_CONNECTORS.find((connector) => connector.id === id);
  }

  it('describes what a connector does rather than whether it is available', () => {
    expect(projected('adobe')?.description).toBe('Creative Cloud asset and font access.');
    expect(projected('gmail')?.description).toBe('Email search, reading, sending, and drafts.');
  });

  it('leaves availability to the status line', () => {
    for (const connector of SETTINGS_CONNECTORS) {
      expect(connector.description).not.toMatch(/^Not available by default/);
    }
    expect(projected('adobe')?.statusLabel).toBe('Not connected');
  });

  it('carries the vendor name as the publisher', () => {
    expect(projected('adobe')?.publisher).toBe('Adobe Creative Cloud');
    expect(projected('gmail')?.publisher).toBe('Gmail');
  });
});
