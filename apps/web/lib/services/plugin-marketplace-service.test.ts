import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES,
  PLUGIN_MARKETPLACE_MAX_PLUGINS,
} from '@agiworkforce/cloud-contracts';
import {
  PluginMarketplaceFetchError,
  PluginMarketplaceValidationError,
  fetchMarketplaceManifest,
  standardManifestToInternal,
  parseGithubRepositoryUrl,
  refreshMarketplaceSource,
  registerMarketplaceSource,
  validateManifestAgainstCatalog,
} from './plugin-marketplace-service';

const VALID_MANIFEST_TEXT = JSON.stringify({
  name: 'Acme internal tools',
  plugins: [
    {
      id: 'acme-support-bundle',
      name: 'Acme Support Bundle',
      description: 'Support triage skills for the Acme helpdesk.',
      version: '1.0.0',
      skills: ['code-review'],
      connectors: ['github'],
      agents: [],
      examplePrompts: ['Summarize this ticket thread.'],
      permissions: [],
    },
  ],
});

const INVALID_CATALOG_MANIFEST_TEXT = JSON.stringify({
  name: 'Acme internal tools',
  plugins: [
    {
      id: 'acme-support-bundle',
      name: 'Acme Support Bundle',
      description: 'Support triage skills for the Acme helpdesk.',
      version: '1.0.0',
      skills: ['not-a-real-skill'],
      connectors: ['not-a-real-connector'],
      agents: [],
      examplePrompts: [],
      permissions: [],
    },
  ],
});

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function ownManifestOnly(body: string) {
  return vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes('/repos/'))
      return fakeFetchResponse(JSON.stringify({ default_branch: 'main' }));
    if (url.includes('.claude-plugin/marketplace.json')) return fakeFetchResponse('', false, 404);
    return fakeFetchResponse(body);
  });
}

function fakeFetchResponse(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers({ 'content-length': String(body.length) }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

function fakeDb(): DatabaseAdapter & {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
} {
  const db = {
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(0),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return db as unknown as DatabaseAdapter & {
    query: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
}

const SOURCE_ROW = {
  id: 'source-1',
  name: 'Acme internal tools',
  repository_url: 'https://github.com/acme/tools',
  ref: 'main',
  status: 'active',
  last_error: null,
  content_hash: hashOf(VALID_MANIFEST_TEXT),
  entry_count: 1,
  last_synced_at: '2026-09-03T00:00:00.000Z',
  created_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

describe('parseGithubRepositoryUrl', () => {
  it('accepts a plain github.com repository url', () => {
    expect(parseGithubRepositoryUrl('https://github.com/acme/tools')).toEqual({
      owner: 'acme',
      repo: 'tools',
    });
  });

  it('accepts a trailing .git suffix and slash', () => {
    expect(parseGithubRepositoryUrl('https://github.com/acme/tools.git/')).toEqual({
      owner: 'acme',
      repo: 'tools',
    });
  });

  it('rejects a non-github host', () => {
    expect(parseGithubRepositoryUrl('https://gitlab.com/acme/tools')).toBeNull();
  });

  it('rejects a url with no repository path', () => {
    expect(parseGithubRepositoryUrl('https://github.com/acme')).toBeNull();
  });
});

describe('fetchMarketplaceManifest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches, hashes, and parses a valid manifest at a pinned ref', async () => {
    const fetchMock = ownManifestOnly(VALID_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', 'main');

    expect(result.manifest.plugins[0]?.id).toBe('acme-support-bundle');
    expect(result.contentHash).toBe(hashOf(VALID_MANIFEST_TEXT));
    expect(result.resolvedRef).toBe('main');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'raw.githubusercontent.com/acme/tools/main/.claude-plugin/marketplace.json',
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      'raw.githubusercontent.com/acme/tools/main/.agiworkforce/marketplace.json',
    );
  });

  it('resolves the default branch via the GitHub API when no ref is given', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('/repos/')) {
        return fakeFetchResponse(JSON.stringify({ default_branch: 'trunk' }));
      }
      if (url.includes('.claude-plugin/marketplace.json')) return fakeFetchResponse('', false, 404);
      return fakeFetchResponse(VALID_MANIFEST_TEXT);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', null);

    expect(result.resolvedRef).toBe('trunk');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.github.com/repos/acme/tools');
  });

  it('rejects a non-github repository url before making any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMarketplaceManifest('https://example.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('raises a fetch error when no manifest exists at the documented path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse('not found', false, 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMarketplaceManifest('https://github.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceFetchError);
  });

  it('rejects a manifest that is not valid JSON', async () => {
    const fetchMock = ownManifestOnly('{not json');
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMarketplaceManifest('https://github.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
  });

  it('rejects a manifest that fails schema validation', async () => {
    const fetchMock = ownManifestOnly(JSON.stringify({ plugins: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMarketplaceManifest('https://github.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
  });
});

describe('validateManifestAgainstCatalog', () => {
  it('passes a manifest that only references real skills and connectors', async () => {
    const manifest = JSON.parse(VALID_MANIFEST_TEXT);
    const issues = await validateManifestAgainstCatalog(manifest);
    expect(issues).toEqual([]);
  });

  it('flags a manifest referencing a connector that does not exist', async () => {
    const manifest = JSON.parse(INVALID_CATALOG_MANIFEST_TEXT);
    const issues = await validateManifestAgainstCatalog(manifest);
    expect(issues.some((issue) => issue.includes('not-a-real-connector'))).toBe(true);
  });

  it('accepts a skill name the managed catalogue does not have, because the manifest ships its own', async () => {
    const manifest = JSON.parse(INVALID_CATALOG_MANIFEST_TEXT);
    const issues = await validateManifestAgainstCatalog(manifest);
    expect(issues.some((issue) => issue.includes('not-a-real-skill'))).toBe(false);
  });
});

describe('registerMarketplaceSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses to register a manifest referencing an unknown connector', async () => {
    const fetchMock = ownManifestOnly(INVALID_CATALOG_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();

    await expect(
      registerMarketplaceSource(db, 'user-1', {
        repositoryUrl: 'https://github.com/acme/tools',
        ref: 'main',
      }),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('inserts a new source and pins its entries when none existed yet', async () => {
    const fetchMock = ownManifestOnly(VALID_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce([]) // findExistingSource: none
      .mockResolvedValueOnce([{ id: 'source-1' }]) // insert ... returning id
      .mockResolvedValueOnce([SOURCE_ROW]); // getMarketplaceSource

    const summary = await registerMarketplaceSource(db, 'user-1', {
      repositoryUrl: 'https://github.com/acme/tools',
      ref: 'main',
    });

    expect(summary?.id).toBe('source-1');
    expect(summary?.entryCount).toBe(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    const insertSql = String(db.query.mock.calls[1]?.[0]).toLowerCase();
    expect(insertSql).toContain('insert into public.plugin_marketplace_sources');
    const entrySql = String(db.execute.mock.calls[0]?.[0]).toLowerCase();
    expect(entrySql).toContain('insert into public.plugin_marketplace_entries');
    expect(entrySql).toContain('on conflict (source_id, plugin_key) do update');
  });

  it('updates the existing source in place on a repeat registration', async () => {
    const fetchMock = ownManifestOnly(VALID_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce([{ id: 'source-1' }]) // findExistingSource: found
      .mockResolvedValueOnce([SOURCE_ROW]); // getMarketplaceSource

    await registerMarketplaceSource(db, 'user-1', {
      repositoryUrl: 'https://github.com/acme/tools',
      ref: 'main',
    });

    const updateSql = String(db.execute.mock.calls[0]?.[0]).toLowerCase();
    expect(updateSql).toContain('update public.plugin_marketplace_sources');
  });
});

describe('refreshMarketplaceSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for a source the user does not own or that does not exist', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]);

    const result = await refreshMarketplaceSource(db, 'user-1', 'source-1');
    expect(result).toBeNull();
  });

  it('skips re-pinning entries when the manifest content hash is unchanged', async () => {
    const fetchMock = ownManifestOnly(VALID_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce([SOURCE_ROW]) // load source (content_hash already matches)
      .mockResolvedValueOnce([SOURCE_ROW]); // getMarketplaceSource

    await refreshMarketplaceSource(db, 'user-1', 'source-1');

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(String(db.execute.mock.calls[0]?.[0]).toLowerCase()).toContain("set status = 'active'");
  });

  it('replaces entries through a transaction when the content hash changed', async () => {
    const fetchMock = ownManifestOnly(VALID_MANIFEST_TEXT);
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce([{ ...SOURCE_ROW, content_hash: 'stale-hash' }])
      .mockResolvedValueOnce([SOURCE_ROW]);

    await refreshMarketplaceSource(db, 'user-1', 'source-1');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      db.execute.mock.calls.some((call) =>
        String(call[0]).toLowerCase().includes('insert into public.plugin_marketplace_entries'),
      ),
    ).toBe(true);
  });

  it('marks the source in error and keeps the last-known-good cache when the fetch fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse('not found', false, 404));
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce([SOURCE_ROW])
      .mockResolvedValueOnce([{ ...SOURCE_ROW, status: 'error', last_error: 'boom' }]);

    const result = await refreshMarketplaceSource(db, 'user-1', 'source-1');

    expect(result?.status).toBe('error');
    expect(db.transaction).not.toHaveBeenCalled();
    const errorSql = String(db.execute.mock.calls[0]?.[0]).toLowerCase();
    expect(errorSql).toContain("status = 'error'");
  });
});

describe('the standard Claude Code manifest', () => {
  const STANDARD = JSON.stringify({
    name: 'claude-plugins-official',
    owner: { name: 'Anthropic' },
    plugins: [
      {
        name: 'box',
        description: 'Box workflows for legal teams.',
        source: './plugins/box',
        skills: ['./skills/box', './skills/box-legal-workflows'],
      },
      { name: 'coursera', displayName: 'Coursera', source: './plugins/coursera' },
    ],
  });

  it('normalises plugins the directory ingest would accept', () => {
    const manifest = standardManifestToInternal(JSON.parse(STANDARD));
    expect(manifest.name).toBe('claude-plugins-official');
    expect(manifest.plugins[0]).toMatchObject({
      id: 'box',
      name: 'box',
      description: 'Box workflows for legal teams.',
      version: '0.0.0',
      skills: ['box', 'box-legal-workflows'],
      connectors: [],
    });
  });

  it('prefers a display name and falls back to the id when a description is absent', () => {
    const manifest = standardManifestToInternal(JSON.parse(STANDARD));
    expect(manifest.plugins[1]).toMatchObject({
      id: 'coursera',
      name: 'Coursera',
      description: 'coursera',
    });
  });

  it('reads the standard path first and never falls back when it is present', async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (input: string) => {
      requested.push(String(input));
      if (String(input).includes('/repos/')) return fakeFetchResponse('{"default_branch":"main"}');
      if (String(input).includes('.claude-plugin/marketplace.json')) {
        return fakeFetchResponse(STANDARD);
      }
      return fakeFetchResponse('', false, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/anthropics/x', 'main');

    expect(result.manifest.plugins).toHaveLength(2);
    expect(requested.some((url) => url.includes('.agiworkforce/marketplace.json'))).toBe(false);
  });

  it('falls back to our own manifest path when the standard file is absent', async () => {
    const own = JSON.stringify({
      name: 'acme',
      plugins: [
        {
          id: 'acme-support',
          name: 'Acme Support',
          description: 'Support desk.',
          version: '1.2.0',
          skills: ['triage-ticket'],
        },
      ],
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (String(input).includes('/repos/')) return fakeFetchResponse('{"default_branch":"main"}');
      if (String(input).includes('.claude-plugin/marketplace.json')) {
        return fakeFetchResponse('', false, 404);
      }
      return fakeFetchResponse(own);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', 'main');
    expect(result.manifest.plugins[0]).toMatchObject({ id: 'acme-support', version: '1.2.0' });
  });

  it('names both paths when neither is published', async () => {
    const fetchMock = vi.fn(async (input: string) =>
      String(input).includes('/repos/')
        ? fakeFetchResponse('{"default_branch":"main"}')
        : fakeFetchResponse('', false, 404),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMarketplaceManifest('https://github.com/acme/tools', 'main')).rejects.toThrow(
      /\.claude-plugin\/marketplace\.json or \.agiworkforce\/marketplace\.json/,
    );
  });
});

describe('a manifest too large to register', () => {
  afterEach(() => vi.unstubAllGlobals());

  function servingStandard(body: string) {
    return vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('/repos/')) {
        return fakeFetchResponse(JSON.stringify({ default_branch: 'main' }));
      }
      if (url.includes('.claude-plugin/marketplace.json')) return fakeFetchResponse(body);
      return fakeFetchResponse('', false, 404);
    });
  }

  function servingOwn(body: string) {
    return vi.fn(async (input: string) => {
      const url = String(input);
      if (url.includes('/repos/')) {
        return fakeFetchResponse(JSON.stringify({ default_branch: 'main' }));
      }
      if (url.includes('.claude-plugin/marketplace.json')) return fakeFetchResponse('', false, 404);
      return fakeFetchResponse(body);
    });
  }

  const overCap = PLUGIN_MARKETPLACE_MAX_PLUGINS + 1;

  it('refuses an over-cap standard manifest instead of writing a row per plugin', async () => {
    const body = JSON.stringify({
      name: 'huge',
      plugins: Array.from({ length: overCap }, (_, index) => ({
        name: `plugin-${index}`,
        description: 'x',
        source: './plugins/x',
      })),
    });
    vi.stubGlobal('fetch', servingStandard(body));

    await expect(
      fetchMarketplaceManifest('https://github.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
    await expect(fetchMarketplaceManifest('https://github.com/acme/tools', 'main')).rejects.toThrow(
      String(PLUGIN_MARKETPLACE_MAX_PLUGINS),
    );
  });

  it('refuses an over-cap manifest in our own format too', async () => {
    const body = JSON.stringify({
      name: 'huge',
      plugins: Array.from({ length: overCap }, (_, index) => ({
        id: `plugin-${index}`,
        name: `Plugin ${index}`,
        description: 'x',
        version: '1.0.0',
      })),
    });
    vi.stubGlobal('fetch', servingOwn(body));

    await expect(fetchMarketplaceManifest('https://github.com/acme/tools', 'main')).rejects.toThrow(
      String(PLUGIN_MARKETPLACE_MAX_PLUGINS),
    );
  });

  it('refuses a body past the byte ceiling before it is parsed', async () => {
    const body = `{"name":"huge","plugins":[],"pad":"${'x'.repeat(PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES)}"}`;
    vi.stubGlobal('fetch', servingStandard(body));

    await expect(fetchMarketplaceManifest('https://github.com/acme/tools', 'main')).rejects.toThrow(
      /larger than/,
    );
  });

  it('registerMarketplaceSource surfaces the refusal as a validation error, not a write', async () => {
    const body = JSON.stringify({
      name: 'huge',
      plugins: Array.from({ length: overCap }, (_, index) => ({
        name: `plugin-${index}`,
        description: 'x',
        source: './plugins/x',
      })),
    });
    vi.stubGlobal('fetch', servingStandard(body));
    const db = fakeDb();

    await expect(
      registerMarketplaceSource(db, 'user-1', {
        repositoryUrl: 'https://github.com/acme/tools',
        ref: 'main',
      }),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('accepts a manifest exactly at the cap', async () => {
    const body = JSON.stringify({
      name: 'at-the-cap',
      plugins: Array.from({ length: PLUGIN_MARKETPLACE_MAX_PLUGINS }, (_, index) => ({
        name: `plugin-${index}`,
        description: 'x',
        source: './plugins/x',
      })),
    });
    vi.stubGlobal('fetch', servingStandard(body));

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', 'main');
    expect(result.manifest.plugins).toHaveLength(PLUGIN_MARKETPLACE_MAX_PLUGINS);
  });
});

describe('registering the same repository twice', () => {
  afterEach(() => vi.unstubAllGlobals());

  function registeringDb() {
    const db = fakeDb();
    db.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('select id from public.plugin_marketplace_sources')) {
        return [{ id: 'source-1' }];
      }
      if (text.includes('entry_count')) return [SOURCE_ROW];
      return [];
    });
    return db;
  }

  it.each([
    ['a different case', 'https://github.com/Acme/Tools'],
    ['a trailing slash', 'https://github.com/acme/tools/'],
    ['a .git suffix', 'https://github.com/acme/tools.git'],
  ])('adopts the existing row when the url differs only by %s', async (_label, url) => {
    vi.stubGlobal('fetch', ownManifestOnly(VALID_MANIFEST_TEXT));
    const db = registeringDb();

    await registerMarketplaceSource(db, 'user-1', { repositoryUrl: url, ref: 'main' });

    const inserted = db.query.mock.calls.filter((call) =>
      String(call[0]).includes('insert into public.plugin_marketplace_sources'),
    );
    expect(inserted).toHaveLength(0);
    const update = db.execute.mock.calls.find((call) =>
      String(call[0]).includes('update public.plugin_marketplace_sources'),
    );
    expect(update?.[1]?.[0]).toBe('source-1');
    const storedUrl = String(update?.[1]?.[2]).toLowerCase();
    expect(storedUrl).toBe('https://github.com/acme/tools');
  });

  it('adopts the existing row when only the ref differs', async () => {
    vi.stubGlobal('fetch', ownManifestOnly(VALID_MANIFEST_TEXT));
    const db = registeringDb();

    await registerMarketplaceSource(db, 'user-1', {
      repositoryUrl: 'https://github.com/acme/tools',
    });

    const lookup = db.query.mock.calls.find((call) =>
      String(call[0]).includes('select id from public.plugin_marketplace_sources'),
    );
    expect(String(lookup?.[0])).not.toContain('ref is not distinct from');
    expect(lookup?.[1]).toEqual(['user-1', 'https://github.com/acme/tools']);
  });

  it('matches case-insensitively in the lookup itself', async () => {
    vi.stubGlobal('fetch', ownManifestOnly(VALID_MANIFEST_TEXT));
    const db = registeringDb();

    await registerMarketplaceSource(db, 'user-1', {
      repositoryUrl: 'https://github.com/ACME/Tools',
      ref: 'main',
    });

    const lookup = db.query.mock.calls.find((call) =>
      String(call[0]).includes('select id from public.plugin_marketplace_sources'),
    );
    expect(String(lookup?.[0])).toContain('lower(repository_url) = lower($2)');
  });

  it('stores a canonical url on a first registration', async () => {
    vi.stubGlobal('fetch', ownManifestOnly(VALID_MANIFEST_TEXT));
    const db = fakeDb();
    db.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('insert into public.plugin_marketplace_sources')) {
        return [{ id: 'source-1' }];
      }
      if (text.includes('entry_count')) return [SOURCE_ROW];
      return [];
    });

    await registerMarketplaceSource(db, 'user-1', {
      repositoryUrl: 'https://github.com/acme/tools.git/',
      ref: 'main',
    });

    const insert = db.query.mock.calls.find((call) =>
      String(call[0]).includes('insert into public.plugin_marketplace_sources'),
    );
    expect(insert?.[1]).toContain('https://github.com/acme/tools');
  });
});
