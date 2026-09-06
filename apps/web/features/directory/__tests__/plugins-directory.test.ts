import type {
  PluginMarketplaceEntry,
  PluginMarketplaceInstallation,
  PluginMarketplaceSourceSummary,
} from '@agiworkforce/cloud-contracts';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PluginDirectoryEntry } from '@/features/plugins/server/directory/types';

import {
  DEFAULT_PLUGIN_QUERY,
  EMPTY_INSTALL_STATE,
  EMPTY_USER_MARKETPLACES,
  fetchPluginDirectoryEntry,
  fetchPluginInstallState,
  installPlugin,
  marketplaceRequest,
  pluginDirectoryHref,
  toDirectoryShape,
  toPluginDetail,
  toPluginEntry,
  toPluginRequest,
  toPluginSection,
  uninstallPlugin,
  withInstallBlock,
  type PluginInstallState,
} from '../services/plugins-directory';

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMAND = 'claude plugin install frontend-design@claude-plugins-official';
const STATS = {
  totalPlugins: 345,
  verified: 319,
  bySource: { builtin: 8, partner: 23, marketplace: 314 },
  byWorksWith: { 'claude-code': 314, cowork: 32, web: 60 },
};

function directoryEntry(patch: Partial<PluginDirectoryEntry> = {}): PluginDirectoryEntry {
  return {
    id: 'frontend-design',
    slug: 'frontend-design',
    name: 'Frontend Design',
    version: '0.0.0+sha.85cce03',
    description: 'Create distinctive frontend interfaces.',
    category: 'development',
    publisher: { id: 'anthropic', name: 'Anthropic', kind: 'third-party', url: null },
    source: 'marketplace',
    status: 'published',
    webInstallable: true,
    declaredSkills: ['frontend-design'],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: ['Design a pricing page'],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: 'https://example.invalid/frontend-design',
    installCount: 1_134_112,
    createdAt: '2026-09-06T06:28:22.443Z',
    updatedAt: '2026-09-06T06:34:14.238Z',
    sourceFacet: 'marketplace',
    verified: true,
    installs: 1_134_112,
    worksWith: ['claude-code', 'web'],
    repositoryUrl: 'https://github.com/example/plugins',
    marketplace: {
      name: 'example-marketplace',
      repositoryUrl: 'https://github.com/example/marketplace',
      manifestUrl: null,
      contentHash: null,
    },
    installCommand: COMMAND,
    runtime: {
      webInstallable: true,
      inspected: true,
      components: {
        skills: ['frontend-design'],
        skillPaths: ['skills/frontend-design/SKILL.md'],
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

function builtinEntry(patch: Partial<PluginDirectoryEntry> = {}): PluginDirectoryEntry {
  return directoryEntry({
    id: 'data-pack',
    slug: 'data-pack',
    name: 'Data Pack',
    publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
    source: 'builtin',
    sourceFacet: 'builtin',
    installs: 0,
    installCount: 0,
    worksWith: [],
    repositoryUrl: null,
    marketplace: null,
    installCommand: null,
    ...patch,
  });
}

function partnerEntry(patch: Partial<PluginDirectoryEntry> = {}): PluginDirectoryEntry {
  return directoryEntry({
    id: 'bio-research',
    slug: 'bio-research',
    name: 'Bio Research',
    publisher: { id: 'claude-directory', name: 'Directory listing', kind: 'partner', url: null },
    source: 'marketplace',
    sourceFacet: 'partner',
    webInstallable: false,
    installs: null,
    installCount: undefined,
    worksWith: ['cowork'],
    repositoryUrl: null,
    marketplace: null,
    installCommand: null,
    runtime: {
      webInstallable: false,
      inspected: false,
      components: {
        skills: [],
        skillPaths: [],
        commands: 0,
        agents: 0,
        hooks: false,
        mcpServers: [],
        lspServers: [],
      },
      note: 'This plugin is listed for Cowork only.',
    },
    ...patch,
  });
}

function installation(
  patch: Partial<PluginMarketplaceInstallation> = {},
): PluginMarketplaceInstallation {
  return {
    id: 'inst-1',
    entryId: 'entry-1',
    sourceId: 'source-1',
    pluginKey: 'frontend-design',
    installedVersion: '0.0.0+sha.85cce03',
    enabled: true,
    enabledSkills: ['frontend-design'],
    customExamplePrompts: null,
    installedAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...patch,
  };
}

function installs(patch: Partial<PluginInstallState> = {}): PluginInstallState {
  return { ...EMPTY_INSTALL_STATE, ...patch };
}

function installedByKey(...keys: string[]): PluginInstallState {
  return installs({
    byPluginKey: new Map(keys.map((key) => [key, installation({ pluginKey: key })])),
  });
}

function userSource(): PluginMarketplaceSourceSummary {
  return {
    id: 'source-9',
    name: 'Team marketplace',
    repositoryUrl: 'https://github.com/example/team-plugins',
    ref: null,
    status: 'active',
    lastError: null,
    contentHash: 'abc',
    entryCount: 1,
    lastSyncedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function userEntry(): PluginMarketplaceEntry {
  return {
    id: 'entry-9',
    sourceId: 'source-9',
    pluginKey: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews pull requests',
    version: '0.1.0',
    declaredSkills: ['reviewer'],
    requiredConnectors: [],
    agents: ['reviewer-agent'],
    examplePrompts: ['Review this branch'],
    permissions: [],
    contentHash: 'abc',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function section(patch: Partial<Parameters<typeof toPluginSection>[0]> = {}) {
  return toPluginSection({
    query: DEFAULT_PLUGIN_QUERY,
    builtin: [builtinEntry()],
    partner: [partnerEntry()],
    marketplace: { entries: [directoryEntry()], total: 314, nextCursor: '100' },
    stats: STATS,
    user: EMPTY_USER_MARKETPLACES,
    installs: EMPTY_INSTALL_STATE,
    ...patch,
  });
}

describe('toPluginRequest and pluginDirectoryHref', () => {
  it('maps the facet tab, the works-with filter, the sort and the cursor onto the api', () => {
    const request = toPluginRequest(
      {
        ...DEFAULT_PLUGIN_QUERY,
        search: ' front ',
        sourceId: 'marketplace',
        selection: { 'works-with': ['web'] },
        sort: 'name',
      },
      '100',
    );
    expect(request).toEqual({
      search: 'front',
      source: 'marketplace',
      worksWith: 'web',
      sort: 'name',
      cursor: '100',
    });
    expect(pluginDirectoryHref(request)).toBe(
      '/api/plugins?search=front&source=marketplace&worksWith=web&sort=name&limit=100&cursor=100',
    );
  });

  it('defaults to the installs sort and treats a user marketplace id as no facet', () => {
    const request = toPluginRequest({ ...DEFAULT_PLUGIN_QUERY, sourceId: 'source-9' });
    expect(request.source).toBeNull();
    expect(pluginDirectoryHref(request)).toBe('/api/plugins?sort=installs&limit=100');
  });

  it('always asks the server for the marketplace facet when the view is grouped', () => {
    expect(pluginDirectoryHref(marketplaceRequest(DEFAULT_PLUGIN_QUERY, '100'))).toBe(
      '/api/plugins?source=marketplace&sort=installs&limit=100&cursor=100',
    );
    expect(marketplaceRequest({ ...DEFAULT_PLUGIN_QUERY, sourceId: 'builtin' }).source).toBe(
      'builtin',
    );
  });
});

describe('toPluginEntry', () => {
  it('carries the publisher, the verified glyph, the real install count and the works-with facet', () => {
    const entry = toPluginEntry(directoryEntry(), EMPTY_INSTALL_STATE);
    expect(entry).toMatchObject({
      id: 'frontend-design',
      publisher: 'Anthropic',
      badges: ['verified'],
      installCount: 1_134_112,
      sourceId: 'marketplace',
      groupId: 'marketplace',
      installed: false,
      installable: true,
      statusLabel: 'Install',
      facets: { 'works-with': ['claude-code', 'web'] },
    });
  });

  it('omits the count when the directory has none and names the desktop state', () => {
    const entry = toPluginEntry(partnerEntry(), EMPTY_INSTALL_STATE);
    expect('installCount' in entry).toBe(false);
    expect(entry).toMatchObject({ installable: false, statusLabel: 'Desktop and CLI' });
  });

  it('says Coming later for an unpublished built-in pack', () => {
    const entry = toPluginEntry(builtinEntry({ status: 'preview' }), EMPTY_INSTALL_STATE);
    expect(entry.statusLabel).toBe('Coming later');
  });

  it('keys installed state by plugin key for directory entries and by id for built-ins', () => {
    expect(toPluginEntry(directoryEntry(), installedByKey('frontend-design'))).toMatchObject({
      installed: true,
      statusLabel: 'Installed',
    });
    expect(
      toPluginEntry(builtinEntry(), installs({ builtinIds: new Set(['data-pack']) })).installed,
    ).toBe(true);
    expect(toPluginEntry(builtinEntry(), installedByKey('data-pack')).installed).toBe(false);
  });
});

describe('toPluginDetail', () => {
  it('maps components, links, the command and works-with labels', () => {
    const detail = toPluginDetail(
      directoryEntry({
        runtime: {
          webInstallable: true,
          inspected: true,
          components: {
            skills: ['frontend-design'],
            skillPaths: [],
            commands: 2,
            agents: 1,
            hooks: true,
            mcpServers: [{ name: 'github', transport: 'http' }],
            lspServers: ['tsserver'],
          },
          note: null,
        },
      }),
      EMPTY_INSTALL_STATE,
    );
    expect(detail).toMatchObject({
      kind: 'plugin',
      verified: true,
      installCount: 1_134_112,
      components: {
        skills: ['frontend-design'],
        commands: 2,
        agents: 1,
        hooks: true,
        mcpServers: [{ name: 'github', transport: 'http' }],
        lspServers: ['tsserver'],
      },
      installCommand: COMMAND,
      homepageUrl: 'https://example.invalid/frontend-design',
      repositoryUrl: 'https://github.com/example/plugins',
      marketplaceName: 'example-marketplace',
      marketplaceUrl: 'https://github.com/example/marketplace',
      worksWith: ['Web', 'CLI'],
      installable: true,
    });
    expect(detail.availabilityNote).toBeUndefined();
  });

  it('carries the runtime note and the desktop state for a plugin the web cannot install', () => {
    const detail = toPluginDetail(partnerEntry(), EMPTY_INSTALL_STATE);
    expect(detail).toMatchObject({
      installable: false,
      availabilityNote: 'Desktop and CLI',
      runtimeNote: 'This plugin is listed for Cowork only.',
      worksWith: ['Cowork'],
    });
  });
});

describe('toDirectoryShape', () => {
  it('lifts a registry entry into the directory shape without inventing counts', () => {
    const registry = {
      id: 'calendar-assistant',
      name: 'Calendar Assistant',
      version: '1.2.0',
      description: 'Scheduling',
      category: 'Productivity',
      publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
      source: 'builtin',
      status: 'preview',
      webInstallable: false,
      declaredSkills: ['Scheduler'],
      requiredConnectors: [],
      capabilities: [],
      permissions: [],
      examplePrompts: [],
      versions: [],
      distribution: null,
      integrity: { sha256: null, signature: null, signatureAlgorithm: null },
      homepageUrl: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    } as PluginRegistryEntry;
    const shaped = toDirectoryShape(registry);
    expect(shaped).toMatchObject({
      sourceFacet: 'builtin',
      verified: true,
      installs: null,
      installCommand: null,
      runtime: { webInstallable: false, components: { skills: ['Scheduler'] } },
    });
    const already = directoryEntry();
    expect(toDirectoryShape(already)).toBe(already);
  });
});

describe('toPluginSection', () => {
  it('groups built-in packs, partners and the marketplace page in that order', () => {
    const result = section();
    expect(result.groups?.map((group) => group.id)).toEqual(['builtin', 'partner', 'marketplace']);
    expect(result.entries.map((entry) => [entry.id, entry.groupId])).toEqual([
      ['data-pack', 'builtin'],
      ['bio-research', 'partner'],
      ['frontend-design', 'marketplace'],
    ]);
    expect(result).toMatchObject({
      remote: true,
      total: 316,
      hasMore: true,
      countLabel: '345 plugins',
    });
    expect(result.sources?.map((chip) => chip.id)).toEqual([
      'all',
      'builtin',
      'partner',
      'marketplace',
    ]);
    expect(result.filterGroups?.[0]).toMatchObject({
      id: 'works-with',
      exclusive: true,
      options: [
        { value: 'web', label: 'Web' },
        { value: 'claude-code', label: 'CLI' },
        { value: 'cowork', label: 'Cowork' },
      ],
    });
    expect(result.sortOptions).toEqual(['installs', 'name']);
  });

  it('narrows the local groups by search and works-with while the marketplace page stays as served', () => {
    const searched = section({ query: { ...DEFAULT_PLUGIN_QUERY, search: 'data' } });
    expect(searched.entries.map((entry) => entry.id)).toEqual(['data-pack', 'frontend-design']);
    const web = section({
      query: { ...DEFAULT_PLUGIN_QUERY, selection: { 'works-with': ['web'] } },
    });
    expect(web.entries.map((entry) => entry.id)).toEqual(['frontend-design']);
  });

  it('shows one facet with its heading and count and no groups', () => {
    const result = section({ query: { ...DEFAULT_PLUGIN_QUERY, sourceId: 'builtin' } });
    expect(result.groups).toBeUndefined();
    expect(result.catalogHeading).toBe('Built-in packs');
    expect(result.countLabel).toBe('8 plugins');
    expect(result.entries.map((entry) => entry.id)).toEqual(['data-pack']);
    expect(result).toMatchObject({ total: 1, hasMore: false });
    const marketplace = section({
      query: { ...DEFAULT_PLUGIN_QUERY, sourceId: 'marketplace' },
    });
    expect(marketplace).toMatchObject({
      catalogHeading: 'Marketplace plugins',
      countLabel: '314 plugins',
      total: 314,
      hasMore: true,
    });
  });

  it('appends synced marketplaces as a trailing group and lists one on its own tab', () => {
    const user = { sources: [userSource()], entries: [userEntry()] };
    const all = section({ user });
    expect(all.groups?.map((group) => group.id)).toContain('user-marketplaces');
    expect(all.entries.at(-1)).toMatchObject({
      id: 'entry-9',
      publisher: 'Team marketplace',
      groupId: 'user-marketplaces',
    });
    expect(all.sources?.at(-1)).toMatchObject({ id: 'source-9', label: 'Team marketplace' });
    const own = section({ user, query: { ...DEFAULT_PLUGIN_QUERY, sourceId: 'source-9' } });
    expect(own.entries.map((entry) => entry.id)).toEqual(['entry-9']);
    expect(own).toMatchObject({ catalogHeading: 'Team marketplace', countLabel: '1 plugins' });
  });

  it('sorts the local groups by name when asked', () => {
    const result = section({
      builtin: [
        builtinEntry({ id: 'zeta', name: 'Zeta' }),
        builtinEntry({ id: 'alpha', name: 'Alpha' }),
      ],
      query: { ...DEFAULT_PLUGIN_QUERY, sort: 'name' },
    });
    expect(result.entries.slice(0, 2).map((entry) => entry.id)).toEqual(['alpha', 'zeta']);
  });
});

describe('withInstallBlock', () => {
  it('turns a refused install into a desktop entry carrying the sentence and the command', () => {
    const blocked = withInstallBlock(directoryEntry(), 'Runs hooks the web cannot execute.', null);
    expect(blocked.webInstallable).toBe(false);
    expect(blocked.runtime).toMatchObject({
      webInstallable: false,
      note: 'Runs hooks the web cannot execute.',
    });
    expect(blocked.installCommand).toBe(COMMAND);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

describe('fetchPluginInstallState', () => {
  it('reads both installation lists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        Promise.resolve(
          input === '/api/plugins/installations'
            ? jsonResponse({ installations: [{ pluginId: 'data-pack', enabled: true }] })
            : jsonResponse({ installations: [installation()] }),
        ),
      ),
    );
    const state = await fetchPluginInstallState();
    expect(state.builtinIds).toEqual(new Set(['data-pack']));
    expect(state.byPluginKey.get('frontend-design')?.id).toBe('inst-1');
    expect(state.byEntryId.get('entry-1')?.id).toBe('inst-1');
    expect(state.notice).toBeNull();
  });

  it('keeps the installs-disabled sentence as a notice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        Promise.resolve(
          input === '/api/plugins/installations'
            ? jsonResponse({ installations: [] })
            : jsonResponse(
                {
                  error: {
                    code: 'PLUGIN_INSTALLS_DISABLED',
                    message: 'Plugin installs are not enabled on this deployment yet',
                  },
                },
                503,
              ),
        ),
      ),
    );
    const state = await fetchPluginInstallState();
    expect(state.notice).toBe('Plugin installs are not enabled on this deployment yet');
    expect(state.byPluginKey.size).toBe(0);
  });

  it('survives a refused connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const state = await fetchPluginInstallState();
    expect(state).toMatchObject({ notice: null });
    expect(state.builtinIds.size).toBe(0);
  });
});

describe('fetchPluginDirectoryEntry', () => {
  it('reads a directory entry and returns null when missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        Promise.resolve(
          input === '/api/plugins/frontend-design'
            ? jsonResponse({ entry: directoryEntry(), manifest: null })
            : jsonResponse({ error: { code: 'NOT_FOUND' } }, 404),
        ),
      ),
    );
    expect((await fetchPluginDirectoryEntry('frontend-design'))?.id).toBe('frontend-design');
    expect(await fetchPluginDirectoryEntry('missing')).toBeNull();
  });
});

describe('installPlugin', () => {
  it('posts the plugin id to the marketplace installations route for directory entries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ installation: installation() }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      installPlugin({ kind: 'directory', pluginId: 'frontend-design' }, 'token'),
    ).resolves.toEqual({ status: 'installed' });
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/marketplace-installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'token' },
      body: JSON.stringify({ pluginId: 'frontend-design' }),
    });
  });

  it('routes built-in packs and synced marketplace entries to their own bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 201));
    vi.stubGlobal('fetch', fetchMock);
    await installPlugin({ kind: 'builtin', pluginId: 'data-pack' }, 'token');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/plugins/installations');
    await installPlugin({ kind: 'user', entryId: 'entry-9' }, 'token');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ entryId: 'entry-9' }));
  });

  it('reports installs disabled and a blocked install as outcomes, not errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: {
                code: 'PLUGIN_INSTALLS_DISABLED',
                message: 'Plugin installs are not enabled on this deployment yet',
              },
            },
            503,
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: {
                code: 'PLUGIN_NOT_INSTALLABLE',
                message: 'Runs hooks the web cannot execute.',
                installCommand: COMMAND,
              },
            },
            409,
          ),
        ),
    );
    await expect(
      installPlugin({ kind: 'directory', pluginId: 'frontend-design' }, 'token'),
    ).resolves.toEqual({
      status: 'disabled',
      message: 'Plugin installs are not enabled on this deployment yet',
    });
    await expect(
      installPlugin({ kind: 'directory', pluginId: 'frontend-design' }, 'token'),
    ).resolves.toEqual({
      status: 'blocked',
      message: 'Runs hooks the web cannot execute.',
      installCommand: COMMAND,
    });
  });

  it('throws the server sentence for a documented refusal and the fallback otherwise', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: { code: 'PLUGIN_SOURCE_UNAVAILABLE', message: 'Skills could not be fetched.' },
            },
            502,
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'stack trace' } }, 500)),
    );
    await expect(
      installPlugin({ kind: 'directory', pluginId: 'frontend-design' }, 'token'),
    ).rejects.toThrow('Skills could not be fetched.');
    await expect(
      installPlugin({ kind: 'directory', pluginId: 'frontend-design' }, 'token'),
    ).rejects.toThrow('Could not install this plugin. Try again.');
  });
});

describe('uninstallPlugin', () => {
  it('deletes by installation id for directory plugins and by plugin id for built-ins', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      uninstallPlugin({ kind: 'installation', installationId: 'inst-1' }, 'token'),
    ).resolves.toEqual({ status: 'removed' });
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/marketplace-installations/inst-1', {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'token' },
    });
    await uninstallPlugin({ kind: 'builtin', pluginId: 'data-pack' }, 'token');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/plugins/installations/data-pack', {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'token' },
    });
  });

  it('throws the fallback sentence when the uninstall is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(
      uninstallPlugin({ kind: 'installation', installationId: 'missing' }, 'token'),
    ).rejects.toThrow('Could not uninstall this plugin. Try again.');
  });
});
