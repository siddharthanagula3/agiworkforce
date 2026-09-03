import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PluginMarketplaceFetchError,
  PluginMarketplaceValidationError,
  fetchMarketplaceManifest,
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

function fakeFetchResponse(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(VALID_MANIFEST_TEXT));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', 'main');

    expect(result.manifest.plugins[0]?.id).toBe('acme-support-bundle');
    expect(result.contentHash).toBe(hashOf(VALID_MANIFEST_TEXT));
    expect(result.resolvedRef).toBe('main');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'raw.githubusercontent.com/acme/tools/main/.agiworkforce/marketplace.json',
    );
  });

  it('resolves the default branch via the GitHub API when no ref is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeFetchResponse(JSON.stringify({ default_branch: 'trunk' })))
      .mockResolvedValueOnce(fakeFetchResponse(VALID_MANIFEST_TEXT));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketplaceManifest('https://github.com/acme/tools', null);

    expect(result.resolvedRef).toBe('trunk');
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse('{not json'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMarketplaceManifest('https://github.com/acme/tools', 'main'),
    ).rejects.toBeInstanceOf(PluginMarketplaceValidationError);
  });

  it('rejects a manifest that fails schema validation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(JSON.stringify({ plugins: [] })));
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

  it('flags a manifest referencing a skill or connector that does not exist', async () => {
    const manifest = JSON.parse(INVALID_CATALOG_MANIFEST_TEXT);
    const issues = await validateManifestAgainstCatalog(manifest);
    expect(issues.some((issue) => issue.includes('not-a-real-skill'))).toBe(true);
    expect(issues.some((issue) => issue.includes('not-a-real-connector'))).toBe(true);
  });
});

describe('registerMarketplaceSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses to register a manifest referencing unknown skills or connectors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(INVALID_CATALOG_MANIFEST_TEXT));
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(VALID_MANIFEST_TEXT));
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(VALID_MANIFEST_TEXT));
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(VALID_MANIFEST_TEXT));
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
    const fetchMock = vi.fn().mockResolvedValue(fakeFetchResponse(VALID_MANIFEST_TEXT));
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
