import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';

import {
  fetchConnectedConnectorIds,
  fetchConnectorRecord,
  fetchConnectorRecords,
  toConnectorDetail,
  toConnectorEntry,
  toConnectorSection,
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
    expect(detail.href).toBeUndefined();
  });

  it('prefers the documentation link and falls back to the website', () => {
    expect(
      toConnectorDetail(record({ documentationUrl: 'https://docs.invalid' }), new Set()).href,
    ).toBe('https://docs.invalid');
    expect(toConnectorDetail(record({ websiteUrl: 'https://site.invalid' }), new Set()).href).toBe(
      'https://site.invalid',
    );
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
