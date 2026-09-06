import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cardHtml, listingHtml, SHA } from './fixtures';

const cache = vi.hoisted(() => ({
  snapshot: null as unknown[] | null,
  inspections: {} as Record<string, unknown>,
  syncState: null as Record<string, unknown> | null,
  lease: null as { startedAt: string; expiresAt: string } | null,
  writes: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../snapshot-cache', () => ({
  DEFAULT_PLUGIN_SYNC_STATE: {
    lastSyncAt: null,
    lastManifestHash: null,
    lastError: null,
    firstSeenAt: {},
  },
  readPluginSnapshotRecords: async () => cache.snapshot,
  writePluginSnapshotRecords: async (records: unknown[]) => {
    cache.snapshot = records;
    cache.writes.push('snapshot');
    return 1;
  },
  readPluginInspections: async () => cache.inspections,
  writePluginInspections: async (map: Record<string, unknown>) => {
    cache.inspections = map;
    cache.writes.push('inspections');
  },
  readPluginSyncState: async () =>
    cache.syncState ?? {
      lastSyncAt: null,
      lastManifestHash: null,
      lastError: null,
      firstSeenAt: {},
    },
  writePluginSyncState: async (state: Record<string, unknown>) => {
    cache.syncState = state;
    cache.writes.push('sync-state');
  },
  readPluginIngestLease: async () => cache.lease,
  writePluginIngestLease: async (lease: { startedAt: string; expiresAt: string }) => {
    cache.lease = lease;
  },
  clearPluginIngestLease: async () => {
    cache.lease = null;
  },
}));

import { ingestBudgetForMaxDuration, ingestPluginDirectory } from '../ingest';
import type { PluginDirectoryEntry } from '../types';

const MANIFEST = {
  name: 'claude-plugins-official',
  owner: { name: 'Anthropic' },
  renames: { adlc: 'agentforce-adlc' },
  plugins: [
    {
      name: 'agent-sdk-dev',
      description: 'Development kit',
      source: './plugins/agent-sdk-dev',
      category: 'development',
    },
    {
      name: 'adobe-for-creativity',
      description: 'Adobe tools',
      author: { name: 'Adobe' },
      category: 'design',
      source: {
        source: 'git-subdir',
        url: 'https://github.com/adobe/skills.git',
        path: 'plugins/creative-cloud/adobe-for-creativity',
        ref: 'main',
        sha: SHA,
      },
    },
    {
      name: 'agentforce-adlc',
      description: 'Renamed plugin',
      source: { source: 'url', url: 'https://github.com/salesforce/adlc.git', sha: SHA },
    },
    {
      name: 'adobe-copy',
      description: 'Same repository and path as adobe-for-creativity',
      source: {
        source: 'git-subdir',
        url: 'https://github.com/adobe/skills.git',
        path: 'plugins/creative-cloud/adobe-for-creativity',
        sha: SHA,
      },
    },
  ],
};

const OFFICIAL_TREE_SHA = 'f'.repeat(40);

function treeFor(url: string) {
  if (url.includes('/repos/anthropics/claude-plugins-official/')) {
    return {
      sha: OFFICIAL_TREE_SHA,
      tree: [
        { path: 'plugins/agent-sdk-dev/skills/agent-sdk/SKILL.md', type: 'blob' },
        { path: 'plugins/agent-sdk-dev/.claude-plugin/plugin.json', type: 'blob' },
      ],
      truncated: false,
    };
  }
  if (url.includes('/repos/adobe/skills/')) {
    return {
      sha: SHA,
      tree: [
        {
          path: 'plugins/creative-cloud/adobe-for-creativity/skills/background-removal/SKILL.md',
          type: 'blob',
        },
      ],
      truncated: false,
    };
  }
  return {
    sha: SHA,
    tree: [
      { path: 'hooks/hooks.json', type: 'blob' },
      { path: 'skills/deploy/SKILL.md', type: 'blob' },
    ],
    truncated: false,
  };
}

function fakeFetch(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string, _init?: RequestInit) => {
    calls.push(input);
    const custom = Object.entries(overrides).find(([needle]) => input.includes(needle))?.[1];
    if (custom) return custom();
    if (input.endsWith('marketplace.json')) return Response.json(MANIFEST);
    if (input === 'https://claude.com/plugins') {
      return new Response(
        listingHtml([
          cardHtml('adobe-for-creativity', { installs: '1,200', verified: true }),
          cardHtml('adlc', { installs: '40' }),
          cardHtml('sales', { worksWith: ['Cowork'], verified: true }),
          cardHtml('searchfit-seo', { installs: '9' }),
        ]),
        { status: 200 },
      );
    }
    if (input.startsWith('https://claude.com/plugins?'))
      return new Response(listingHtml([]), { status: 200 });
    if (input.startsWith('https://claude.com/plugins/searchfit-seo')) {
      return new Response(
        '<button data-copy="claude plugin install searchfit-seo@claude-plugins-official"></button>',
        { status: 200 },
      );
    }
    if (input.includes('/git/trees/')) return Response.json(treeFor(input));
    if (input.endsWith('plugin.json')) return Response.json({ version: '3.1.0' });
    return new Response('', { status: 404 });
  });
  return { fetchImpl, calls };
}

const BUDGET = ingestBudgetForMaxDuration(800);

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', '');
  cache.snapshot = null;
  cache.inspections = {};
  cache.syncState = null;
  cache.lease = null;
  cache.writes = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ingestPluginDirectory', () => {
  it('builds the directory from the manifest, the public listing and inspections', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl,
      githubToken: 'token',
      now: () => Date.parse('2026-09-06T10:00:00.000Z'),
    });

    expect(summary).toMatchObject({
      marketplacesFetched: 1,
      marketplacesFailed: [],
      manifestPlugins: 4,
      publicCards: 4,
      publicMatched: 2,
      publicOnly: 2,
      detailFetches: 1,
      inspectionsCached: 0,
      inspectionsFailed: 0,
      inspectionsPending: 0,
      rateLimited: false,
      duplicatesDropped: 1,
      totalRecords: 5,
      bySource: { marketplace: 4, partner: 1 },
      wroteSnapshot: true,
    });
    expect(summary.inspectionsRun).toBe(3);
    expect(
      calls.filter((url) => url.includes('/repos/anthropics/claude-plugins-official/git/trees/')),
    ).toHaveLength(1);

    const records = cache.snapshot as PluginDirectoryEntry[];
    const byId = new Map(records.map((record) => [record.id, record]));
    expect([...byId.keys()]).toEqual([
      'agent-sdk-dev',
      'adobe-for-creativity',
      'agentforce-adlc',
      'sales',
      'searchfit-seo',
    ]);

    expect(byId.get('adobe-for-creativity')).toMatchObject({
      installs: 1200,
      verified: true,
      runtime: { webInstallable: true, inspected: true },
      declaredSkills: ['background-removal'],
      sourceLocation: { sha: SHA },
    });
    expect(byId.get('agentforce-adlc')).toMatchObject({
      slug: 'adlc',
      installs: 40,
      runtime: { webInstallable: false, inspected: true },
    });
    expect(byId.get('agent-sdk-dev')).toMatchObject({
      version: '3.1.0',
      sourceLocation: { sha: OFFICIAL_TREE_SHA },
      runtime: { webInstallable: true },
    });
    expect(byId.get('sales')).toMatchObject({ sourceFacet: 'partner', worksWith: ['cowork'] });
    expect(byId.get('searchfit-seo')).toMatchObject({
      sourceFacet: 'marketplace',
      installCommand: 'claude plugin install searchfit-seo@claude-plugins-official',
    });
    expect(cache.writes).toEqual(['snapshot', 'inspections', 'sync-state']);
    expect(cache.syncState).toMatchObject({
      lastSyncAt: '2026-09-06T10:00:00.000Z',
      lastError: null,
    });
    expect(
      Object.keys((cache.syncState as { firstSeenAt: Record<string, string> }).firstSeenAt),
    ).toHaveLength(5);
  });

  it('reuses cached inspections and first-seen dates on the next run', async () => {
    const first = fakeFetch();
    await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl: first.fetchImpl,
      githubToken: 'token',
      now: () => 1,
    });
    const second = fakeFetch();
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl: second.fetchImpl,
      githubToken: 'token',
      now: () => 2_000_000,
    });
    expect(summary.inspectionsRun).toBe(0);
    expect(summary.inspectionsCached).toBe(4);
    expect(summary.detailFetches).toBe(0);
    expect(second.calls.some((url) => url.includes('/git/trees/'))).toBe(false);
    const record = (cache.snapshot as PluginDirectoryEntry[]).find(
      (entry) => entry.id === 'adobe-for-creativity',
    );
    expect(record?.createdAt).toBe(new Date(1).toISOString());
  });

  it('caps unauthenticated inspections and reports the backlog', async () => {
    const { fetchImpl } = fakeFetch();
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl,
      githubToken: undefined,
      now: () => 1,
    });
    expect(summary.inspectionsRun).toBeLessThanOrEqual(40);
    expect(summary.inspectionsPending).toBe(0);
  });

  it('drops a rejected github token and finishes the inspections unauthenticated', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const fetchWithAuthCheck = vi.fn(async (input: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers['Authorization'] && input.includes('/git/trees/')) {
        return new Response('', { status: 401 });
      }
      return fetchImpl(input, init);
    });
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl: fetchWithAuthCheck,
      githubToken: 'rejected-token',
      now: () => 1,
    });
    expect(summary.inspectionsFailed).toBe(0);
    expect(summary.inspectionsPending).toBe(0);
    expect(summary.webInstallable).toBeGreaterThan(0);
    expect(calls.filter((url) => url.includes('/git/trees/')).length).toBeGreaterThan(0);
  });

  it('keeps inspecting marketplace-repository plugins after the unauthenticated api cap', async () => {
    const vendors = Array.from({ length: 45 }, (_, index) => ({
      name: `vendor-${index}`,
      description: `Vendor ${index}`,
      source: { source: 'url', url: `https://github.com/vendor${index}/plugin.git`, sha: SHA },
    }));
    const relative = [
      { name: 'relative-a', description: 'A', source: './plugins/relative-a' },
      { name: 'relative-b', description: 'B', source: './plugins/relative-b' },
    ];
    const { fetchImpl } = fakeFetch({
      'marketplace.json': () => Response.json({ ...MANIFEST, plugins: [...vendors, ...relative] }),
      '/repos/anthropics/claude-plugins-official/git/trees/': () =>
        Response.json({
          sha: OFFICIAL_TREE_SHA,
          tree: [
            { path: 'plugins/relative-a/skills/a/SKILL.md', type: 'blob' },
            { path: 'plugins/relative-b/skills/b/SKILL.md', type: 'blob' },
          ],
          truncated: false,
        }),
    });
    const summary = await ingestPluginDirectory({ budget: BUDGET, fetchImpl, now: () => 1 });
    expect(summary.inspectionsRun).toBe(40);
    expect(summary.inspectionsPending).toBe(47 - 39 - 2);
    const records = cache.snapshot as PluginDirectoryEntry[];
    expect(records.find((record) => record.id === 'relative-a')?.runtime.inspected).toBe(true);
    expect(records.find((record) => record.id === 'relative-b')?.runtime.inspected).toBe(true);
  });

  it('stops inspecting when github rate limits and keeps the rest pending', async () => {
    const { fetchImpl } = fakeFetch({
      '/git/trees/': () =>
        new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    });
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl,
      githubToken: 'token',
      now: () => 1,
    });
    expect(summary.rateLimited).toBe(true);
    expect(summary.inspectionsPending).toBe(3);
    const records = cache.snapshot as PluginDirectoryEntry[];
    expect(
      records.every(
        (record) =>
          record.sourceFacet !== 'marketplace' ||
          record.runtime.inspected === false ||
          record.sourceLocation === null,
      ),
    ).toBe(true);
  });

  it('keeps the previous snapshot and records the error when the manifest is unreachable', async () => {
    cache.snapshot = [];
    const { fetchImpl } = fakeFetch({
      'marketplace.json': () => new Response('', { status: 500 }),
    });
    await expect(
      ingestPluginDirectory({ budget: BUDGET, fetchImpl, now: () => 1 }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(cache.syncState).toMatchObject({
      lastError: expect.stringContaining('claude-plugins-official'),
    });
    expect(cache.writes).toEqual(['sync-state']);
  });

  it('carries forward manifest entries when a later run cannot fetch the manifest', async () => {
    const first = fakeFetch();
    await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl: first.fetchImpl,
      githubToken: 'token',
      now: () => 1,
    });
    const second = fakeFetch({ 'marketplace.json': () => new Response('', { status: 500 }) });
    const summary = await ingestPluginDirectory({
      budget: BUDGET,
      fetchImpl: second.fetchImpl,
      now: () => 2,
    });
    expect(summary.marketplacesFailed).toEqual(['claude-plugins-official']);
    expect(summary.totalRecords).toBe(5);
    expect(cache.syncState).toMatchObject({
      lastError: expect.stringContaining('claude-plugins-official'),
    });
  });

  it('refuses to run while another ingest holds the lease', async () => {
    cache.lease = { startedAt: '2026-09-06T09:00:00.000Z', expiresAt: '2026-09-06T09:20:00.000Z' };
    const { fetchImpl } = fakeFetch();
    await expect(
      ingestPluginDirectory({
        budget: BUDGET,
        fetchImpl,
        now: () => Date.parse('2026-09-06T09:10:00.000Z'),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('splits the budget across manifests, the public listing and inspections', () => {
    expect(ingestBudgetForMaxDuration(100)).toEqual({
      manifestMs: 15_000,
      publicMs: 40_000,
      inspectionMs: 90_000,
      totalMs: 100_000,
    });
  });
});
