import { afterEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_CONNECTORS } from '@features/settings/components/WebSettingsModal';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

import {
  DEFAULT_DIRECTORY_QUERY,
  connectorDirectoryHref,
  connectorStateLabel,
  curatedDirectoryCategory,
  fetchConnectedConnectorIds,
  fetchConnectedConnectors,
  fetchConnectorDirectoryPage,
  fetchConnectorRecord,
  initialConnectorSection,
  matchesCuratedConnector,
  registrySignIn,
  relatedConnectorRequest,
  toConnectorDetail,
  toConnectorEntry,
  toConnectorSection,
  toCuratedConnectorDetail,
  toCuratedConnectorEntry,
  toDirectoryRequest,
  toRelatedConnectors,
  connectedConnectorIds,
  type ConnectorDirectoryRequest,
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

function request(patch: Partial<ConnectorDirectoryRequest> = {}): ConnectorDirectoryRequest {
  return {
    search: '',
    badge: null,
    category: null,
    connectableOnly: true,
    sort: 'popular',
    cursor: null,
    ...patch,
  };
}

function section(
  records: DirectoryRecord[],
  connected: ReadonlySet<string>,
  curated: import('@agiworkforce/ui').SettingsConnector[] = [],
  patch: Partial<Parameters<typeof toConnectorSection>[0]> = {},
) {
  return toConnectorSection({
    records,
    connectedIds: connected,
    curated,
    request: request(),
    total: records.length,
    nextCursor: null,
    categories: records.flatMap((entry) => entry.categories),
    ...patch,
  });
}

describe('toConnectorEntry', () => {
  it('proxies the icon through the app rather than the third party url', () => {
    const entry = toConnectorEntry(record(), new Set());
    expect(entry.iconUrl).toBe('/api/connectors/directory/icon?id=customerscore');
  });

  it('names the brand from the record slug so the card renders the official mark', () => {
    expect(toConnectorEntry(record({ brandSlug: 'github' }), new Set()).brandId).toBe('github');
    expect(toConnectorEntry(record(), new Set()).brandId).toBeUndefined();
    expect(toConnectorDetail(record({ brandSlug: 'github' }), new Set()).brandId).toBe('github');
  });

  it('falls back to the monogram when the record has no icon', () => {
    const entry = toConnectorEntry(record({ iconUrl: null }), new Set());
    expect(entry.iconUrl).toBeNull();
    expect(entry.monogram).toBe('CU');
  });

  it('never labels a vendor connector as made by AGI', () => {
    for (const badge of ['first-party', 'official', 'verified', 'registry', 'community'] as const) {
      expect(toConnectorEntry(record({ badge }), new Set()).badges).not.toContain('agi');
    }
  });

  it('maps each source tier to one of the four visible badges', () => {
    expect(toConnectorEntry(record({ badge: 'first-party' }), new Set()).badges).toEqual([
      'first-party',
    ]);
    expect(toConnectorEntry(record({ badge: 'official' }), new Set()).badges).toEqual(['official']);
    expect(toConnectorEntry(record({ badge: 'verified' }), new Set()).badges).toEqual(['verified']);
    for (const badge of ['registry', 'community'] as const) {
      expect(toConnectorEntry(record({ badge }), new Set()).badges).toEqual(['community']);
    }
  });

  it('gives the detail header the same badge as the card', () => {
    for (const badge of ['first-party', 'official', 'verified', 'registry', 'community'] as const) {
      expect(toConnectorDetail(record({ badge }), new Set()).badge).toBe(
        toConnectorEntry(record({ badge }), new Set()).badges?.[0],
      );
    }
  });

  it('marks a connector the account has already connected', () => {
    expect(toConnectorEntry(record(), new Set(['customerscore'])).installed).toBe(true);
    expect(toConnectorEntry(record(), new Set(['other'])).installed).toBe(false);
  });

  it('carries a state line only for modes the control cannot express', () => {
    expect(toConnectorEntry(record(), new Set()).connectableMode).toBe('connect');
    expect(toConnectorEntry(record(), new Set()).statusLabel).toBeUndefined();
    expect(toConnectorEntry(record(), new Set(['customerscore'])).statusLabel).toBeUndefined();
    expect(
      toConnectorEntry(record({ connectable: 'desktop-and-cli' }), new Set()).statusLabel,
    ).toBe('Desktop and CLI');
    expect(toConnectorEntry(record({ connectable: 'needs-setup' }), new Set()).statusLabel).toBe(
      'Needs setup',
    );
    expect(connectorStateLabel('api-key-form', false)).toBeUndefined();
  });

  it('exposes the category as a filterable facet', () => {
    expect(toConnectorEntry(record(), new Set()).facets).toEqual({ category: ['Data'] });
  });

  it('never invents an install count', () => {
    expect(toConnectorEntry(record(), new Set()).installCount).toBeUndefined();
  });
});

describe('directory requests', () => {
  it('defaults to remote connectors sorted by popularity', () => {
    expect(toDirectoryRequest(DEFAULT_DIRECTORY_QUERY)).toEqual(request());
  });

  it('maps the tabs, the category filter, the sort and the cursor', () => {
    const mapped = toDirectoryRequest(
      {
        search: '  gmail ',
        sourceId: 'community',
        selection: { category: ['Data'] },
        sort: 'name',
        toggles: { 'include-local': true },
      },
      '100',
    );
    expect(mapped).toEqual({
      search: 'gmail',
      badge: 'community',
      category: 'Data',
      connectableOnly: false,
      sort: 'name',
      cursor: '100',
    });
  });

  it('ignores a tab id the api does not know', () => {
    expect(toDirectoryRequest({ ...DEFAULT_DIRECTORY_QUERY, sourceId: 'all' }).badge).toBeNull();
  });

  it('builds the query string the directory api reads', () => {
    expect(connectorDirectoryHref(request())).toBe(
      '/api/connectors/directory?connectableOnly=true&sort=popular&limit=100',
    );
    expect(
      connectorDirectoryHref(
        request({
          search: 'gmail',
          badge: 'official',
          category: 'Data',
          connectableOnly: false,
          sort: 'name',
          cursor: '200',
        }),
      ),
    ).toBe(
      '/api/connectors/directory?search=gmail&badge=official&category=Data&sort=name&limit=100&cursor=200',
    );
  });

  it('reads a page with its total, cursor, categories and stats', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entries: [record()],
          total: 2_368,
          nextCursor: '100',
          categories: ['Data', 'Productivity'],
          stats: { totalRecords: 17_204 },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = await fetchConnectorDirectoryPage(request());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connectors/directory?connectableOnly=true&sort=popular&limit=100',
      { cache: 'no-store' },
    );
    expect(page).toMatchObject({
      total: 2_368,
      nextCursor: '100',
      categories: ['Data', 'Productivity'],
      stats: { totalRecords: 17_204 },
    });
    expect(page.entries).toHaveLength(1);
  });

  it('tolerates the older response shape with no total or stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entries: [record()] }),
      }),
    );
    const page = await fetchConnectorDirectoryPage(request());
    expect(page.total).toBe(1);
    expect(page.nextCursor).toBeNull();
    expect(page.stats).toBeUndefined();
  });

  it('throws when the directory is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchConnectorDirectoryPage(request())).rejects.toThrow(
      'connector directory failed: 503',
    );
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

  it('reads the connected ids and the deployment setup requirements together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            connectors: [{ connectorId: 'github' }],
            setup: {
              gmail: { missingEnv: ['GMAIL_CLIENT_ID'], message: 'Gmail needs a client id.' },
            },
          }),
      }),
    );
    const snapshot = await fetchConnectedConnectors();
    expect(snapshot.ids).toEqual(new Set(['github']));
    expect(snapshot.setup['gmail']?.message).toBe('Gmail needs a client id.');
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

describe('toConnectorSection', () => {
  it('starts as a remote section with the three tabs, both sorts and the local toggle', () => {
    const initial = initialConnectorSection();
    expect(initial.remote).toBe(true);
    expect(initial.sources?.map((source) => source.label)).toEqual([
      'All',
      'Official',
      'Community',
    ]);
    expect(initial.sortOptions).toEqual(['popular', 'name']);
    expect(initial.toggles?.map((toggle) => toggle.id)).toEqual(['include-local']);
    expect(initial.toggleDefaults).toEqual({ 'include-local': false });
  });

  it('offers a category filter built from the api categories', () => {
    const built = section([record()], new Set(), [], {
      categories: ['Productivity', 'Data'],
    });
    expect(built.filterGroups?.map((group) => group.id)).toEqual(['category']);
    expect(built.filterGroups?.[0]?.options.map((option) => option.value)).toEqual([
      'Data',
      'Productivity',
    ]);
  });

  it('hides the category filter when only one category exists', () => {
    expect(section([record()], new Set()).filterGroups).toEqual([]);
  });

  it('carries paging state and the directory count from the stats alone', () => {
    const built = section([record()], new Set(), [curated()], {
      total: 2_368,
      nextCursor: '100',
      stats: { totalRecords: 17_204 },
    });
    expect(built.total).toBe(2_369);
    expect(built.hasMore).toBe(true);
    expect(built.countLabel).toBe('17,204 connectors');
  });

  it('leads Top connectors with the first page featured records and the curated seeds', () => {
    const built = section(
      [
        record({ id: 'a', featured: true }),
        record({ id: 'b', featured: true }),
        record({ id: 'c' }),
      ],
      new Set(),
      [curated()],
      { featuredLimit: 1 },
    );
    expect(built.entries.filter((entry) => entry.popular).map((entry) => entry.id)).toEqual([
      'gmail',
      'a',
    ]);
    expect(built.catalogHeading).toBeUndefined();
  });

  it('flattens the Official and Community tabs under their own heading', () => {
    for (const [badge, heading] of [
      ['official', 'Official connectors'],
      ['community', 'Community connectors'],
    ] as const) {
      const built = section([record({ badge, featured: true })], new Set(), [curated()], {
        request: request({ badge }),
      });
      expect(built.catalogHeading).toBe(heading);
      expect(built.entries.some((entry) => entry.popular)).toBe(false);
    }
  });

  it('omits the count when the api sends no stats', () => {
    expect(section([record()], new Set()).countLabel).toBeUndefined();
  });

  it('declares connectors installable so the card offers Connect', () => {
    expect(section([record()], new Set()).installable).toBe(true);
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
      facets: { category: ['Communication'] },
    });
  });

  it('never labels a vendor connector as made by AGI', () => {
    const adobe = curated({ id: 'adobe', name: 'Adobe Creative Cloud', publisher: 'Adobe' });
    expect(toCuratedConnectorEntry(adobe, new Set()).badges).not.toContain('agi');
    expect(toCuratedConnectorDetail(adobe, new Set()).badge).not.toBe('agi');
  });

  it('badges a connector the account added by url as custom, never verified', () => {
    const custom = curated({
      id: 'custom-1',
      name: 'My server',
      authType: 'custom_mcp',
      description: 'https://mcp.example.invalid/v1',
    });
    const entry = toCuratedConnectorEntry(custom, new Set());
    expect(entry.badges).toEqual(['custom']);
    expect(entry.publisher).toBe('mcp.example.invalid');
    expect(entry.popular).toBe(false);
    expect(toCuratedConnectorDetail(custom, new Set()).badge).toBe('custom');
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

  it('marks a curated connector the account has connected', () => {
    const entry = toCuratedConnectorEntry(curated(), new Set(['gmail']));
    expect(entry.installed).toBe(true);
    expect(entry.statusLabel).toBeUndefined();
  });

  it('says Needs setup for an unconfigured curated connector', () => {
    const entry = toCuratedConnectorEntry(curated({ canConnect: false }), new Set());
    expect(entry.statusLabel).toBe('Needs setup');
    expect(entry.installable).toBe(false);
    expect(entry.connectableMode).toBe('needs-setup');
  });

  it('keeps the card state line on the four contract states', () => {
    const entry = toCuratedConnectorEntry(
      curated({ canConnect: false, statusLabel: 'Not connected' }),
      new Set(),
    );
    expect(entry.statusLabel).toBe('Needs setup');
    expect(toCuratedConnectorEntry(curated(), new Set()).connectableMode).toBe('connect');
  });

  it('maps curated categories onto the directory categories', () => {
    expect(curatedDirectoryCategory(curated({ category: 'Developer' }))).toBe('Code');
    expect(curatedDirectoryCategory(curated({ category: 'Finance' }))).toBe('Financial services');
    expect(curatedDirectoryCategory(curated({ category: 'Storage' }))).toBe('Productivity');
    expect(curatedDirectoryCategory(curated({ category: 'Communication' }))).toBe('Communication');
    expect(curatedDirectoryCategory(curated({ category: 'Custom' }))).toBe('Other');
    const entry = toCuratedConnectorEntry(curated({ category: 'Developer' }), new Set());
    expect(entry.facets?.['category']).toEqual(['Code']);
    expect(
      toCuratedConnectorDetail(curated({ category: 'Developer' }), new Set()).categories,
    ).toEqual(['Code']);
  });

  it('matches curated connectors against the same search and category', () => {
    expect(matchesCuratedConnector(curated(), request({ search: 'mail' }))).toBe(true);
    expect(matchesCuratedConnector(curated(), request({ search: 'zzz' }))).toBe(false);
    expect(matchesCuratedConnector(curated(), request({ category: 'Communication' }))).toBe(true);
    expect(matchesCuratedConnector(curated(), request({ category: 'Data' }))).toBe(false);
    expect(
      matchesCuratedConnector(curated({ category: 'Developer' }), request({ category: 'Code' })),
    ).toBe(true);
  });

  it('keeps curated connectors under All and Official but not Community', () => {
    expect(matchesCuratedConnector(curated(), request({ badge: 'official' }))).toBe(true);
    expect(matchesCuratedConnector(curated(), request({ badge: 'community' }))).toBe(false);
    const custom = curated({ id: 'custom-1', authType: 'custom_mcp' });
    expect(matchesCuratedConnector(custom, request({ badge: 'official' }))).toBe(false);
    expect(matchesCuratedConnector(custom, request())).toBe(true);
  });

  it('sends the Official tab as the official badge the api indexes', () => {
    expect(toDirectoryRequest({ ...DEFAULT_DIRECTORY_QUERY, sourceId: 'official' }).badge).toBe(
      'official',
    );
  });

  it('leads the section with curated matches and drops a registry duplicate', () => {
    const built = section([record({ id: 'gmail' }), record()], new Set(), [curated()]);
    expect(built.entries.map((entry) => entry.id)).toEqual(['gmail', 'customerscore']);
    expect(built.entries[0]?.popular).toBe(true);
    expect(built.total).toBe(3);
  });

  it('folds curated categories into the filter', () => {
    const built = section([record()], new Set(), [curated()]);
    expect(built.filterGroups?.[0]?.options.map((option) => option.value)).toEqual([
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
      connectableMode: 'connect',
    });
  });

  it('explains what an unconfigured curated connector is missing', () => {
    const detail = toCuratedConnectorDetail(curated({ canConnect: false }), new Set());
    expect(detail.connectableMode).toBe('needs-setup');
    expect(detail.setupNotice).toBe(
      'Connecting Gmail needs credentials this deployment has not been given yet.',
    );
  });

  it('prefers the deployment setup sentence the server reports', () => {
    const detail = toCuratedConnectorDetail(
      curated({ canConnect: false }),
      new Set(),
      'Gmail needs GMAIL_CLIENT_ID before anyone can connect it.',
    );
    expect(detail.setupNotice).toBe('Gmail needs GMAIL_CLIENT_ID before anyone can connect it.');
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
      connectableMode: 'connect',
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
        repositoryUrl: 'https://github.invalid/customerscore',
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
      repositoryUrl: 'https://github.invalid/customerscore',
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

  it('points a desktop only connector at the download page', () => {
    const detail = toConnectorDetail(record({ connectable: 'desktop-and-cli' }), new Set());
    expect(detail.connectable).toBe(false);
    expect(detail.connectableMode).toBe('desktop-and-cli');
    expect(detail.desktopHref).toBe('/download');
  });

  it('says what a registry connector that needs setup is missing', () => {
    const detail = toConnectorDetail(record({ connectable: 'needs-setup' }), new Set());
    expect(detail.connectable).toBe(false);
    expect(detail.setupNotice).toBe(
      'This connector does not say how it authenticates, so it cannot be connected from the browser yet.',
    );
  });

  it('offers the key form for an api key connector', () => {
    const detail = toConnectorDetail(record({ connectable: 'api-key-form' }), new Set());
    expect(detail.connectable).toBe(true);
    expect(detail.connectableMode).toBe('api-key-form');
  });

  it('says sign-in is required for oauth and api key servers and none for open ones', () => {
    expect(registrySignIn('oauth')).toEqual({ signInRequired: true });
    expect(registrySignIn('api-key')).toEqual({ signInRequired: true });
    expect(registrySignIn('none')).toEqual({ signInRequired: false });
    expect(registrySignIn('unknown')).toEqual({});
    expect(toConnectorDetail(record({ authMode: 'none' }), new Set()).signInRequired).toBe(false);
    expect(toCuratedConnectorDetail(curated(), new Set()).signInRequired).toBe(true);
  });

  it('carries the vendor listing note instead of a setup notice', () => {
    const detail = toConnectorDetail(
      record({
        connectable: 'needs-setup',
        listingNote: 'Acme lists this connector without a public endpoint.',
      }),
      new Set(),
    );
    expect(detail.listingNote).toBe('Acme lists this connector without a public endpoint.');
    expect(detail.setupNotice).toBeUndefined();
  });

  it('links the terms page from every detail', () => {
    expect(toConnectorDetail(record(), new Set()).termsHref).toBe('/terms');
    expect(toCuratedConnectorDetail(curated(), new Set()).termsHref).toBe('/terms');
  });
});

describe('related connectors', () => {
  it('asks the api for the category with the related limit', () => {
    expect(connectorDirectoryHref(relatedConnectorRequest('Data'))).toBe(
      '/api/connectors/directory?category=Data&sort=popular&limit=25',
    );
  });

  it('drops the current record, caps at six and prefers the curated entry', () => {
    const records = ['gmail', 'a', 'b', 'c', 'd', 'e', 'f', 'customerscore'].map((id) =>
      record({ id, name: id }),
    );
    const related = toRelatedConnectors(records, 'customerscore', [curated()], new Set(['a']));
    expect(related.map((entry) => entry.id)).toEqual(['gmail', 'a', 'b', 'c', 'd', 'e']);
    expect(related[0]?.brandId).toBe('gmail');
    expect(related[1]?.installed).toBe(true);
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
