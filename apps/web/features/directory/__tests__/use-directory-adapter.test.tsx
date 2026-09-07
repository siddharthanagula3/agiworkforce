import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { isValidElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryActionNotice, type DirectoryMarketplaceResult } from '@agiworkforce/ui';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import type { PluginDirectoryEntry } from '@/features/plugins/server/directory/types';

import { useDirectoryAdapter } from '../hooks/useDirectoryAdapter';
import { DEFAULT_DIRECTORY_QUERY } from '../services/connectors-directory';
import { DEFAULT_PLUGIN_QUERY } from '../services/plugins-directory';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => '/chat',
}));

vi.mock('@features/skills/services/skills-catalog', () => ({
  invalidateSkillsCatalog: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('token'),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function record(id: string, patch: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return {
    id,
    name: id,
    publisher: id,
    description: `${id} description`,
    categories: ['Data'],
    remotes: [],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: id.slice(0, 2).toUpperCase(),
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...patch,
  };
}

function page(
  entries: DirectoryRecord[],
  total: number,
  nextCursor: string | null,
  stats: Record<string, unknown> = {},
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        entries,
        total,
        nextCursor,
        categories: ['Data', 'Productivity'],
        stats: { totalRecords: total, ...stats },
      }),
  };
}

function credentialsResponse(connectorId: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        connectorId,
        name: connectorId,
        documentationUrl: null,
        connected: false,
        headerName: 'Authorization',
        valuePrefix: 'Bearer ',
        placement: 'header',
        source: 'registry',
        description: null,
      }),
  };
}

function connectedResponse(ids: string[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ connectors: ids.map((connectorId) => ({ connectorId })) }),
  };
}

function stubDirectory(pages: Record<string, ReturnType<typeof page>>, connected: string[] = []) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: string) => {
    calls.push(input);
    if (input.endsWith('/credentials')) {
      return Promise.resolve(credentialsResponse(decodeURIComponent(input.split('/')[3] ?? '')));
    }
    if (input.startsWith('/api/connectors/directory')) {
      const cursor = new URL(input, 'http://localhost').searchParams.get('cursor') ?? '';
      const response = pages[cursor];
      if (!response) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve(response);
    }
    return Promise.resolve(connectedResponse(connected));
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('useDirectoryAdapter connectors paging', () => {
  it('fetches the first page for a query and appends the next page on load more', async () => {
    const calls = stubDirectory(
      {
        '': page([record('a'), record('b')], 3, '2'),
        '2': page([record('c')], 3, null),
      },
      ['a'],
    );
    const { result } = renderHook(() => useDirectoryAdapter());

    expect(result.current.connectors?.remote).toBe(true);
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(2));
    expect(calls[0]).toBe('/api/connectors/directory?connectableOnly=true&sort=popular&limit=100');
    expect(result.current.connectors).toMatchObject({
      hasMore: true,
      total: 3,
      countLabel: '3 connectors',
      loading: false,
    });
    expect(result.current.connectors?.entries[0]).toMatchObject({ id: 'a', installed: true });
    expect(result.current.connectors?.filterGroups?.[0]?.options.map((o) => o.value)).toEqual([
      'Data',
      'Productivity',
    ]);

    await act(async () => {
      await result.current.loadMore?.('connectors');
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(3));
    expect(calls.some((call) => call.includes('cursor=2'))).toBe(true);
    expect(result.current.connectors?.hasMore).toBe(false);
    expect(result.current.connectors?.loadingMore).toBe(false);
  });

  it('pins a connected registry connector the first page did not carry', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn((input: string) => {
      calls.push(input);
      if (input === '/api/connectors/directory/acme/learn') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entry: record('acme/learn') }),
        });
      }
      if (input.startsWith('/api/connectors/directory')) {
        return Promise.resolve(page([record('a')], 1, null));
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            connectors: [{ connectorId: 'acme/learn', directoryId: 'acme/learn' }],
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDirectoryAdapter());

    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(2));
    expect(result.current.connectors?.entries[0]).toMatchObject({
      id: 'acme/learn',
      installed: true,
    });

    await act(async () => {
      await result.current.queryEntries?.('connectors', {
        ...DEFAULT_DIRECTORY_QUERY,
        search: 'a',
      });
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(1));
    expect(calls.filter((call) => call === '/api/connectors/directory/acme/learn')).toHaveLength(1);
  });

  it('sends the search, tab and toggle as api parameters and replaces the page', async () => {
    const calls = stubDirectory({
      '': page([record('a')], 1, null),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('connectors', {
        ...DEFAULT_DIRECTORY_QUERY,
        search: 'mail',
        sourceId: 'community',
        toggles: { 'include-local': true },
      });
    });
    expect(calls[0]).toBe(
      '/api/connectors/directory?search=mail&badge=community&sort=popular&limit=100',
    );
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(1));
  });

  it('collapses an identical query that is already in flight into one request', async () => {
    const calls = stubDirectory({ '': page([record('a')], 1, null) });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await Promise.all([
        result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY),
        result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY),
      ]);
    });
    expect(calls.filter((call) => call.startsWith('/api/connectors/directory'))).toHaveLength(1);
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(1));
  });

  it('keeps only the latest response when queries overlap', async () => {
    let resolveFirst: ((value: ReturnType<typeof page>) => void) | null = null;
    const first = new Promise<ReturnType<typeof page>>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/connectors/directory')) {
        if (input.includes('search=slow')) return first;
        return Promise.resolve(page([record('fast')], 1, null));
      }
      return Promise.resolve(connectedResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDirectoryAdapter());

    let slow: Promise<void> | void;
    act(() => {
      slow = result.current.queryEntries?.('connectors', {
        ...DEFAULT_DIRECTORY_QUERY,
        search: 'slow',
      });
    });
    await act(async () => {
      await result.current.queryEntries?.('connectors', {
        ...DEFAULT_DIRECTORY_QUERY,
        search: 'fast',
      });
    });
    await waitFor(() =>
      expect(result.current.connectors?.entries.map((entry) => entry.id)).toEqual(['fast']),
    );
    await act(async () => {
      resolveFirst?.(page([record('slow')], 1, null));
      await slow;
    });
    expect(result.current.connectors?.entries.map((entry) => entry.id)).toEqual(['fast']);
  });

  it('degrades to the curated list when the registry is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        input.startsWith('/api/connectors/directory')
          ? Promise.resolve({ ok: false, status: 503 })
          : Promise.resolve(connectedResponse([])),
      ),
    );
    const { result } = renderHook(() =>
      useDirectoryAdapter({
        curatedConnectors: [
          {
            id: 'gmail',
            name: 'Gmail',
            description: 'Mail',
            category: 'Communication',
            authType: 'oauth',
            actionCount: 0,
            phase: 1,
            iconBg: 'bg-red-500',
            iconText: 'GM',
            canConnect: false,
          },
        ],
      }),
    );
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() => expect(result.current.connectors?.loading).toBe(false));
    expect(result.current.connectors?.error).toBeUndefined();
    expect(result.current.connectors?.notice).toBe(
      'The connector directory is unavailable right now.',
    );
    expect(result.current.connectors?.entries.map((entry) => entry.id)).toEqual(['gmail']);
  });

  it('reports an error when nothing at all can be shown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        input.startsWith('/api/connectors/directory')
          ? Promise.resolve({ ok: false, status: 503 })
          : Promise.resolve(connectedResponse([])),
      ),
    );
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() =>
      expect(result.current.connectors?.error).toBe(
        'The connector directory is unavailable right now.',
      ),
    );
  });
});

describe('useDirectoryAdapter settings deep link', () => {
  const REGISTRY_ID = 'com.microsoft/microsoft-learn-mcp';

  function setHash(hash: string): void {
    window.location.hash = hash;
  }

  afterEach(() => {
    setHash('');
  });

  it('carries the entry a registry-id deep link names', () => {
    setHash(`#settings/customize-connectors/browse/${encodeURIComponent(REGISTRY_ID)}`);
    const { result } = renderHook(() => useDirectoryAdapter());

    expect(result.current.openEntry).toEqual({ section: 'connectors', entryId: REGISTRY_ID });
  });

  it('reads an unencoded slash in the hash the same way', () => {
    setHash(`#settings/customize-connectors/browse/${REGISTRY_ID}`);
    const { result } = renderHook(() => useDirectoryAdapter());

    expect(result.current.openEntry).toEqual({ section: 'connectors', entryId: REGISTRY_ID });
  });

  it('carries no entry for a section link with no id', () => {
    setHash('#settings/customize-connectors');
    const { result } = renderHook(() => useDirectoryAdapter());

    expect(result.current.openEntry).toBeNull();
  });

  it('follows a later hash change', async () => {
    const { result } = renderHook(() => useDirectoryAdapter());
    expect(result.current.openEntry).toBeNull();

    await act(async () => {
      setHash(`#settings/customize-skills/browse/canvas-design`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.openEntry).toEqual({ section: 'skills', entryId: 'canvas-design' });
  });
});

describe('useDirectoryAdapter directory still indexing', () => {
  it('says the directory is still indexing and offers a refresh', async () => {
    stubDirectory({ '': page([record('a')], 412, null, { bootstrapComplete: false }) });
    const { result } = renderHook(() => useDirectoryAdapter());

    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(1));

    expect(result.current.connectors?.countLabel).toBe('412 connectors indexed so far');
    expect(result.current.connectors?.notice).toContain('still being indexed');
    expect(typeof result.current.connectors?.noticeRetry).toBe('function');
    expect(result.current.connectors?.error).toBeUndefined();
  });

  it('says nothing once the crawl has finished', async () => {
    stubDirectory({ '': page([record('a')], 17_204, null, { bootstrapComplete: true }) });
    const { result } = renderHook(() => useDirectoryAdapter());

    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await waitFor(() => expect(result.current.connectors?.entries).toHaveLength(1));

    expect(result.current.connectors?.countLabel).toBe('17,204 connectors');
    expect(result.current.connectors?.notice).toBeUndefined();
  });
});

describe('useDirectoryAdapter connector credentials', () => {
  it('renders the api key form for the connector the detail asked about', async () => {
    stubDirectory({ '': page([record('a', { connectable: 'api-key-form' })], 1, null) });
    const { result } = renderHook(() => useDirectoryAdapter());
    expect(result.current.renderCredentialForm?.('connectors', 'a')).toBeNull();
    act(() => result.current.requestCredentials?.('connectors', 'a'));
    const form = result.current.renderCredentialForm?.('connectors', 'a');
    expect(isValidElement(form)).toBe(true);
    render(<>{form}</>);
    expect(await screen.findByLabelText('API key')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test and save' })).toBeTruthy();
    expect(result.current.renderCredentialForm?.('connectors', 'b')).toBeNull();
    expect(result.current.renderCredentialForm?.('skills', 'a')).toBeNull();
  });

  it('opens the form when the connect post answers with a credentials path', async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input === '/api/connectors' && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              credentialsPath: '/api/connectors/a/credentials',
              message: 'Needs an API key',
            }),
        });
      }
      if (input.startsWith('/api/connectors/directory')) {
        return Promise.resolve(page([record('a')], 1, null));
      }
      return Promise.resolve(connectedResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.install?.('connectors', 'a');
    });
    expect(isValidElement(result.current.renderCredentialForm?.('connectors', 'a'))).toBe(true);
  });

  it('keeps Top connectors to the first page even when later pages are featured', async () => {
    stubDirectory({
      '': page([record('a', { featured: true })], 2, '1'),
      '1': page([record('b', { featured: true })], 2, null),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    await act(async () => {
      await result.current.loadMore?.('connectors');
    });
    expect(result.current.connectors?.entries.map((entry) => [entry.id, entry.popular])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('loads related connectors that share the first category and drops the record itself', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/connectors/directory?')) {
        const category = new URL(input, 'http://localhost').searchParams.get('category');
        return Promise.resolve(
          category === 'Data'
            ? page([record('a'), record('b'), record('c')], 3, null)
            : page([record('a')], 1, null),
        );
      }
      return Promise.resolve(connectedResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    const detail = await result.current.loadDetail?.('connectors', 'a');
    expect(detail).toMatchObject({ kind: 'connector', related: [{ id: 'b' }, { id: 'c' }] });
    expect(fetchMock.mock.calls.map((call) => call[0])).toContain(
      '/api/connectors/directory?category=Data&sort=popular&limit=25',
    );
  });

  it('marks a curated connector connected when the settings list learns of it after the query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        input.startsWith('/api/connectors/directory')
          ? Promise.resolve(page([], 0, null))
          : Promise.resolve(connectedResponse([])),
      ),
    );
    const github = {
      id: 'github',
      name: 'GitHub',
      description: 'Code',
      category: 'Developer',
      authType: 'oauth',
      actionCount: 0,
      phase: 1,
      iconBg: 'bg-black',
      iconText: 'GH',
      canConnect: false,
    };
    const { result, rerender } = renderHook(
      ({ connected }: { connected: { connectorId: string }[] }) =>
        useDirectoryAdapter({ curatedConnectors: [github], connectedConnectors: connected }),
      { initialProps: { connected: [] as { connectorId: string }[] } },
    );
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    expect(result.current.connectors?.entries[0]?.installed).toBe(false);
    rerender({ connected: [{ connectorId: 'github' }] });
    await waitFor(() => expect(result.current.connectors?.entries[0]?.installed).toBe(true));
    const detail = await result.current.loadDetail?.('connectors', 'github');
    expect(detail).toMatchObject({ kind: 'connector', connected: true });
  });

  it('turns a rate limited skill install into a sentence the user can act on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) =>
        input === '/api/skills/installs' && init?.method === 'POST'
          ? Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })
          : Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ skills: [], installed: [] }),
            }),
      ),
    );
    const { result } = renderHook(() => useDirectoryAdapter());
    await expect(result.current.install?.('skills', 'ab-testing')).rejects.toThrow(
      'Too many requests. Wait a minute and try again.',
    );
  });

  it('names a failed plugin install rather than blaming the catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) =>
        input === '/api/plugins/marketplace-installations' && init?.method === 'POST'
          ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) }),
      ),
    );
    const { result } = renderHook(() => useDirectoryAdapter());
    await expect(result.current.install?.('plugins', 'data-pack')).rejects.toThrow(
      'Could not install this plugin. Try again.',
    );
  });

  it('reads the deployment setup message into a curated detail that needs setup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        input.startsWith('/api/connectors/directory')
          ? Promise.resolve(page([], 0, null))
          : Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  connectors: [],
                  setup: {
                    gmail: {
                      kind: 'oauth',
                      missingEnv: ['GMAIL_CLIENT_ID'],
                      message: 'Gmail needs GMAIL_CLIENT_ID before anyone can connect it.',
                    },
                  },
                }),
            }),
      ),
    );
    const { result } = renderHook(() =>
      useDirectoryAdapter({
        curatedConnectors: [
          {
            id: 'gmail',
            name: 'Gmail',
            description: 'Mail',
            category: 'Communication',
            authType: 'oauth',
            actionCount: 0,
            phase: 1,
            iconBg: 'bg-red-500',
            iconText: 'GM',
            canConnect: false,
          },
        ],
      }),
    );
    await act(async () => {
      await result.current.queryEntries?.('connectors', DEFAULT_DIRECTORY_QUERY);
    });
    const detail = await result.current.loadDetail?.('connectors', 'gmail');
    expect(detail).toMatchObject({
      kind: 'connector',
      connectableMode: 'needs-setup',
      setupNotice: 'Gmail needs GMAIL_CLIENT_ID before anyone can connect it.',
    });
  });
});

const PLUGIN_STATS = {
  totalPlugins: 5,
  verified: 5,
  bySource: { builtin: 1, partner: 1, marketplace: 3 },
  byWorksWith: { 'claude-code': 3, cowork: 1, web: 2 },
};
const INSTALL_COMMAND = 'claude plugin install frontend-design@claude-plugins-official';

function pluginEntry(id: string, patch: Partial<PluginDirectoryEntry> = {}): PluginDirectoryEntry {
  return {
    id,
    slug: id,
    name: id,
    version: '1.0.0',
    description: `${id} description`,
    category: 'development',
    publisher: { id: 'anthropic', name: 'Anthropic', kind: 'third-party', url: null },
    source: 'marketplace',
    status: 'published',
    webInstallable: true,
    declaredSkills: [id],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: null,
    installCount: 10,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    sourceFacet: 'marketplace',
    verified: true,
    installs: 10,
    worksWith: ['claude-code', 'web'],
    repositoryUrl: null,
    marketplace: null,
    installCommand: INSTALL_COMMAND,
    runtime: {
      webInstallable: true,
      inspected: true,
      components: {
        skills: [id],
        skillPaths: [],
        commands: 0,
        agents: 0,
        hooks: false,
        mcpServers: [],
        lspServers: [],
      },
      note: null,
    },
    sourceLocation: null,
    ...patch,
  } as PluginDirectoryEntry;
}

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function pluginPage(entries: PluginDirectoryEntry[], total: number, nextCursor: string | null) {
  return json({ entries, total, nextCursor, stats: PLUGIN_STATS });
}

type RouteHandler = (url: URL, init?: RequestInit) => ReturnType<typeof json>;

function stubPluginRoutes(overrides: Record<string, RouteHandler> = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${input}`);
    const url = new URL(input, 'http://localhost');
    const override = overrides[`${method} ${url.pathname}`];
    if (override) return Promise.resolve(override(url, init));
    if (method === 'GET' && url.pathname === '/api/plugins') {
      const source = url.searchParams.get('source');
      if (source === 'builtin') {
        return Promise.resolve(
          pluginPage(
            [
              pluginEntry('data-pack', {
                source: 'builtin',
                sourceFacet: 'builtin',
                publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
                installCommand: null,
              }),
            ],
            1,
            null,
          ),
        );
      }
      if (source === 'partner') {
        return Promise.resolve(
          pluginPage(
            [pluginEntry('bio-research', { sourceFacet: 'partner', webInstallable: false })],
            1,
            null,
          ),
        );
      }
      if (url.searchParams.get('cursor') === '2') {
        return Promise.resolve(pluginPage([pluginEntry('third')], 3, null));
      }
      if (url.searchParams.get('search') === 'front') {
        return Promise.resolve(pluginPage([pluginEntry('frontend-design')], 1, null));
      }
      return Promise.resolve(
        pluginPage([pluginEntry('frontend-design'), pluginEntry('second')], 3, '2'),
      );
    }
    if (url.pathname === '/api/plugins/installations')
      return Promise.resolve(json({ installations: [] }));
    if (url.pathname === '/api/plugins/marketplace-installations') {
      return Promise.resolve(json({ installations: [] }));
    }
    if (url.pathname === '/api/plugins/marketplaces') return Promise.resolve(json({ sources: [] }));
    if (url.pathname === '/api/plugins/marketplaces/entries')
      return Promise.resolve(json({ entries: [] }));
    return Promise.resolve(json({}, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function installationOf(pluginKey: string) {
  return {
    id: 'inst-1',
    entryId: 'entry-1',
    sourceId: 'source-1',
    pluginKey,
    installedVersion: '1.0.0',
    enabled: true,
    enabledSkills: [pluginKey],
    customExamplePrompts: null,
    installedAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
}

describe('the plugins installed table', () => {
  it('is empty and not loading once the install state says nothing is installed', async () => {
    stubPluginRoutes();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await waitFor(() => expect(result.current.plugins?.manage?.loading).toBe(false));
    expect(result.current.plugins?.manage?.rows).toEqual([]);
  });

  it('lists an installed plugin with its author, skill count and install date', async () => {
    stubPluginRoutes({
      'GET /api/plugins/marketplace-installations': () =>
        json({ installations: [installationOf('frontend-design')] }),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await waitFor(() => expect(result.current.plugins?.manage?.rows).toHaveLength(1));
    expect(result.current.plugins?.manage?.rows[0]).toMatchObject({
      id: 'frontend-design',
      author: 'Anthropic',
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
  });

  it('keeps its callbacks stable when the router object is recreated', async () => {
    stubPluginRoutes();
    const { result, rerender } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await waitFor(() => expect(result.current.plugins?.manage?.loading).toBe(false));
    const before = result.current.loadSection;
    rerender();
    expect(result.current.loadSection).toBe(before);
  });

  it('sends Create with AGI to the composer with a prefilled prompt', async () => {
    routerPush.mockClear();
    stubPluginRoutes();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await waitFor(() => expect(result.current.plugins?.manage?.actions).toBeDefined());
    const action = result.current.plugins?.manage?.actions?.[0];
    expect(action?.label).toBe('Create with AGI');
    act(() => action?.onSelect());
    expect(routerPush).toHaveBeenCalledWith(
      '/chat?starterPrompt=Build%20a%20plugin%20for%20me%3A%20',
    );
  });
});

describe('useDirectoryAdapter plugins', () => {
  it('primes the built-in and partner packs once, pages the marketplace and groups them', async () => {
    const calls = stubPluginRoutes();
    const { result } = renderHook(() => useDirectoryAdapter());
    expect(result.current.plugins?.remote).toBe(true);
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await waitFor(() => expect(result.current.plugins?.entries).toHaveLength(4));
    expect(result.current.plugins?.entries.map((entry) => [entry.id, entry.groupId])).toEqual([
      ['data-pack', 'builtin'],
      ['bio-research', 'partner'],
      ['frontend-design', 'marketplace'],
      ['second', 'marketplace'],
    ]);
    expect(result.current.plugins).toMatchObject({
      total: 5,
      hasMore: true,
      countLabel: '5 plugins',
      loading: false,
    });
    expect(result.current.plugins?.groups?.map((group) => group.heading)).toEqual([
      'Built-in packs',
      'Partner plugins',
      'Marketplace plugins',
    ]);
    expect(calls).toContain('GET /api/plugins?source=marketplace&sort=installs&limit=100');
    expect(calls.some((call) => call.startsWith('GET /api/plugins?sort='))).toBe(false);

    await act(async () => {
      await result.current.loadMore?.('plugins');
    });
    await waitFor(() => expect(result.current.plugins?.entries).toHaveLength(5));
    expect(result.current.plugins?.hasMore).toBe(false);

    await act(async () => {
      await result.current.queryEntries?.('plugins', { ...DEFAULT_PLUGIN_QUERY, search: 'front' });
    });
    await waitFor(() =>
      expect(result.current.plugins?.entries.map((entry) => entry.id)).toEqual(['frontend-design']),
    );
    expect(calls.filter((call) => call.includes('source=builtin'))).toHaveLength(1);
  });

  it('serves a built-in tab from the primed packs without a marketplace request', async () => {
    const calls = stubPluginRoutes();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', {
        ...DEFAULT_PLUGIN_QUERY,
        sourceId: 'builtin',
      });
    });
    await waitFor(() => expect(result.current.plugins?.loading).toBe(false));
    expect(result.current.plugins?.entries.map((entry) => entry.id)).toEqual(['data-pack']);
    expect(result.current.plugins?.catalogHeading).toBe('Built-in packs');
    expect(calls.filter((call) => call.startsWith('GET /api/plugins?'))).toEqual([
      'GET /api/plugins?source=builtin&sort=installs&limit=100',
      'GET /api/plugins?source=partner&sort=installs&limit=100',
    ]);
  });

  it('installs a marketplace plugin and marks it installed by plugin key', async () => {
    let installed: ReturnType<typeof installationOf>[] = [];
    const calls = stubPluginRoutes({
      'POST /api/plugins/marketplace-installations': () => {
        installed = [installationOf('frontend-design')];
        return json({ installation: installed[0], skills: ['frontend-design'] }, 201);
      },
      'GET /api/plugins/marketplace-installations': () => json({ installations: installed }),
      'DELETE /api/plugins/marketplace-installations/inst-1': () => {
        installed = [];
        return json(null, 204);
      },
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await act(async () => {
      await result.current.install?.('plugins', 'frontend-design');
    });
    expect(calls).toContain('POST /api/plugins/marketplace-installations');
    await waitFor(() =>
      expect(
        result.current.plugins?.entries.find((entry) => entry.id === 'frontend-design'),
      ).toMatchObject({ installed: true, statusLabel: 'Installed' }),
    );
    const detail = await result.current.loadDetail?.('plugins', 'frontend-design');
    expect(detail).toMatchObject({ kind: 'plugin', installed: true });

    await act(async () => {
      await result.current.uninstall?.('plugins', 'frontend-design');
    });
    expect(calls).toContain('DELETE /api/plugins/marketplace-installations/inst-1');
    await waitFor(() =>
      expect(
        result.current.plugins?.entries.find((entry) => entry.id === 'frontend-design'),
      ).toMatchObject({ installed: false, statusLabel: 'Install' }),
    );
  });

  it('installs a built-in pack through the plugin installations route', async () => {
    const calls = stubPluginRoutes({
      'POST /api/plugins/installations': () => json({}, 201),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    await act(async () => {
      await result.current.install?.('plugins', 'data-pack');
    });
    expect(calls).toContain('POST /api/plugins/installations');
    expect(calls).not.toContain('POST /api/plugins/marketplace-installations');
  });

  it('surfaces the installs-disabled sentence as a notice rather than an error', async () => {
    stubPluginRoutes({
      'POST /api/plugins/marketplace-installations': () =>
        json(
          {
            error: {
              code: 'PLUGIN_INSTALLS_DISABLED',
              message: 'Plugin installs are not enabled on this deployment yet',
            },
          },
          503,
        ),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    const failure = await Promise.resolve(
      result.current.install?.('plugins', 'frontend-design'),
    ).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(DirectoryActionNotice);
    expect((failure as Error).message).toBe(
      'Plugin installs are not enabled on this deployment yet',
    );
  });

  it('turns a refused install into a desktop entry with the command', async () => {
    stubPluginRoutes({
      'POST /api/plugins/marketplace-installations': () =>
        json(
          {
            error: {
              code: 'PLUGIN_NOT_INSTALLABLE',
              message: 'This plugin runs hooks the web app cannot execute.',
              installCommand: INSTALL_COMMAND,
            },
          },
          409,
        ),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    const failure = await Promise.resolve(
      result.current.install?.('plugins', 'frontend-design'),
    ).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(DirectoryActionNotice);
    await waitFor(() =>
      expect(
        result.current.plugins?.entries.find((entry) => entry.id === 'frontend-design'),
      ).toMatchObject({ installable: false, statusLabel: 'Desktop and CLI' }),
    );
    const detail = await result.current.loadDetail?.('plugins', 'frontend-design');
    expect(detail).toMatchObject({
      installable: false,
      runtimeNote: 'This plugin runs hooks the web app cannot execute.',
      installCommand: INSTALL_COMMAND,
    });
  });

  it('fetches a deep-linked plugin that is not on the current page', async () => {
    stubPluginRoutes({
      'GET /api/plugins/elsewhere': () => json({ entry: pluginEntry('elsewhere'), manifest: null }),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    const detail = await result.current.loadDetail?.('plugins', 'elsewhere');
    expect(detail).toMatchObject({ kind: 'plugin', id: 'elsewhere', installable: true });
    expect(await result.current.loadDetail?.('plugins', 'missing')).toBeNull();
  });
});

describe('useDirectoryAdapter plugin settings and enable', () => {
  const SETTINGS = {
    pluginId: 'data-pack',
    enabledSkills: ['data-pack'],
    examplePrompts: [],
    connectors: [{ connectorId: 'github', connected: false }],
    agents: [],
  };

  function stubInstalledBuiltin(overrides: Record<string, RouteHandler> = {}) {
    return stubPluginRoutes({
      'GET /api/plugins/installations': () =>
        json({
          installations: [
            {
              pluginId: 'data-pack',
              installedVersion: '1.0.0',
              enabled: false,
              installedAt: '2026-09-06T00:00:00.000Z',
              updatedAt: '2026-09-06T00:00:00.000Z',
            },
          ],
        }),
      'GET /api/plugins/data-pack/settings': () => json({ settings: SETTINGS }),
      ...overrides,
    });
  }

  it('carries the stored enable position and the declared skills onto the detail', async () => {
    stubInstalledBuiltin();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });

    let detail;
    await act(async () => {
      detail = await result.current.loadDetail?.('plugins', 'data-pack');
    });

    expect(detail).toMatchObject({ installed: true, enabled: false, version: '1.0.0' });
    await waitFor(() =>
      expect(result.current.pluginSettings).toMatchObject({
        pluginId: 'data-pack',
        skills: [{ name: 'data-pack', enabled: true }],
        connectors: [{ id: 'github', connected: false }],
      }),
    );
  });

  it('patches the installation when the enable switch moves', async () => {
    const calls = stubInstalledBuiltin({
      'PATCH /api/plugins/installations/data-pack': () =>
        json({ installation: { pluginId: 'data-pack', enabled: true } }),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
      await result.current.loadDetail?.('plugins', 'data-pack');
    });

    await act(async () => {
      await result.current.setPluginEnabled?.('data-pack', true);
    });

    expect(calls).toContain('PATCH /api/plugins/installations/data-pack');
  });

  it('patches the settings route when a skill is turned off', async () => {
    const calls = stubInstalledBuiltin({
      'PATCH /api/plugins/data-pack/settings': () =>
        json({ settings: { ...SETTINGS, enabledSkills: [] } }),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
      await result.current.loadDetail?.('plugins', 'data-pack');
    });
    await waitFor(() => expect(result.current.pluginSettings?.skills).toHaveLength(1));

    await act(async () => {
      await result.current.setPluginSkillEnabled?.('data-pack', 'data-pack', false);
    });

    expect(calls).toContain('PATCH /api/plugins/data-pack/settings');
    await waitFor(() =>
      expect(result.current.pluginSettings?.skills).toEqual([
        { name: 'data-pack', enabled: false },
      ]),
    );
  });

  it('refreshes a registered marketplace through its refresh route', async () => {
    const calls = stubPluginRoutes({
      'POST /api/plugins/marketplaces/source-1/refresh': () => json({ source: { id: 'source-1' } }),
    });
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });

    await act(async () => {
      await result.current.refreshMarketplace?.('source-1');
    });

    expect(calls).toContain('POST /api/plugins/marketplaces/source-1/refresh');
  });
});

describe('adding a marketplace surfaces it immediately', () => {
  const SOURCE = {
    id: 'source-1',
    name: 'claude-plugins-official',
    repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
    ref: 'main',
    status: 'active' as const,
    lastError: null,
    contentHash: 'a'.repeat(64),
    entryCount: 2,
    lastSyncedAt: '2026-09-07T00:00:00.000Z',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };
  const ENTRIES = [
    {
      id: 'entry-1',
      sourceId: 'source-1',
      pluginKey: 'frontend-design',
      name: 'Frontend Design',
      description: 'Design interfaces.',
      version: '0.0.0',
      declaredSkills: ['frontend-design'],
      requiredConnectors: [],
      agents: [],
      examplePrompts: [],
      permissions: [],
      updatedAt: '2026-09-07T00:00:00.000Z',
    },
    {
      id: 'entry-2',
      sourceId: 'source-1',
      pluginKey: 'superpowers',
      name: 'Superpowers',
      description: 'Do more.',
      version: '0.0.0',
      declaredSkills: [],
      requiredConnectors: [],
      agents: [],
      examplePrompts: [],
      permissions: [],
      updatedAt: '2026-09-07T00:00:00.000Z',
    },
  ];

  function stubAfterAdd() {
    let added = false;
    return stubPluginRoutes({
      'POST /api/plugins/marketplaces': () => {
        added = true;
        return json({ source: { id: SOURCE.id, name: SOURCE.name } }, 201);
      },
      'GET /api/plugins/marketplaces': () => json({ sources: added ? [SOURCE] : [] }),
      'GET /api/plugins/marketplaces/entries': () => json({ entries: added ? ENTRIES : [] }),
    });
  }

  it('returns the new marketplace entries to the dialog', async () => {
    stubAfterAdd();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });

    let added: DirectoryMarketplaceResult | undefined;
    await act(async () => {
      added = await result.current.addMarketplace?.({
        repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      });
    });

    expect(added).toMatchObject({ id: 'source-1', name: 'claude-plugins-official' });
    expect(added?.entries.map((entry) => entry.name)).toEqual(['Frontend Design', 'Superpowers']);
  });

  it('adds a removable source chip to the plugins section', async () => {
    stubAfterAdd();
    const { result } = renderHook(() => useDirectoryAdapter());
    await act(async () => {
      await result.current.queryEntries?.('plugins', DEFAULT_PLUGIN_QUERY);
    });
    expect(result.current.plugins?.sources?.some((source) => source.id === 'source-1')).toBe(false);

    await act(async () => {
      await result.current.addMarketplace?.({
        repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      });
    });

    await waitFor(() => {
      const chip = result.current.plugins?.sources?.find((source) => source.id === 'source-1');
      expect(chip).toMatchObject({ label: 'claude-plugins-official', removable: true });
    });
  });
});

describe('removing a marketplace reports what happened', () => {
  it('reports an unsent request when the csrf token cannot be read', async () => {
    stubPluginRoutes();
    const { getCsrfToken } = await import('@/lib/client/csrf');
    vi.mocked(getCsrfToken).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useDirectoryAdapter());

    await expect(result.current.removeMarketplace?.('source-1')).rejects.toThrow(
      /could not be sent/i,
    );
  });

  it('reports an unsent request when the delete never reaches the server', async () => {
    stubPluginRoutes({
      'DELETE /api/plugins/marketplaces/source-1': () => {
        throw new Error('network down');
      },
    });
    const { result } = renderHook(() => useDirectoryAdapter());

    await expect(result.current.removeMarketplace?.('source-1')).rejects.toThrow(
      /could not be sent/i,
    );
  });

  it('repeats the server sentence when the delete is refused', async () => {
    stubPluginRoutes({
      'DELETE /api/plugins/marketplaces/source-1': () =>
        json({ error: { message: 'Marketplace source not found.' } }, 404),
    });
    const { result } = renderHook(() => useDirectoryAdapter());

    await expect(result.current.removeMarketplace?.('source-1')).rejects.toThrow(
      'Marketplace source not found.',
    );
  });

  it('resolves and refreshes the list when the delete succeeds', async () => {
    const calls = stubPluginRoutes({
      'DELETE /api/plugins/marketplaces/source-1': () => json({}, 204),
    });
    const { result } = renderHook(() => useDirectoryAdapter());

    await act(async () => {
      await result.current.removeMarketplace?.('source-1');
    });

    expect(calls).toContain('DELETE /api/plugins/marketplaces/source-1');
    expect(calls.filter((call) => call === 'GET /api/plugins/marketplaces')).not.toHaveLength(0);
  });
});
