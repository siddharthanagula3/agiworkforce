import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryRecord } from './fixtures';

const mocks = vi.hoisted(() => ({
  fetchRegistryPage: vi.fn(),
  readSnapshotRecords: vi.fn(),
  writeSnapshotRecords: vi.fn(),
  readSyncState: vi.fn(),
  writeSyncState: vi.fn(),
  readIngestLease: vi.fn(),
  writeIngestLease: vi.fn(),
  clearIngestLease: vi.fn(),
  resolveAuthModeForRecord: vi.fn(),
  resolveSiteIconForRecord: vi.fn(),
  internalRecords: vi.fn(() => [] as unknown[]),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/directory/registry-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/connectors/directory/registry-client')>(
    '@/lib/connectors/directory/registry-client',
  );
  return { ...actual, fetchRegistryPage: (...args: unknown[]) => mocks.fetchRegistryPage(...args) };
});
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readSnapshotRecords: () => mocks.readSnapshotRecords(),
  writeSnapshotRecords: (...args: unknown[]) => mocks.writeSnapshotRecords(...args),
  readSyncState: () => mocks.readSyncState(),
  writeSyncState: (...args: unknown[]) => mocks.writeSyncState(...args),
  readIngestLease: (...args: unknown[]) => mocks.readIngestLease(...args),
  writeIngestLease: (...args: unknown[]) => mocks.writeIngestLease(...args),
  clearIngestLease: () => mocks.clearIngestLease(),
  DEFAULT_SYNC_STATE: {
    nextIngestCursor: null,
    bootstrapComplete: false,
    bootstrapStartedAt: null,
    lastSyncAt: null,
    authProbeCursor: null,
    siteIconCursor: null,
  },
}));
vi.mock('@/lib/connectors/directory/favicon-probe', () => ({
  resolveSiteIconForRecord: (record: unknown) => mocks.resolveSiteIconForRecord(record),
}));
vi.mock('@/lib/connectors/directory/auth-probe', async () => {
  const view = await vi.importActual<typeof import('@/lib/connectors/directory/snapshot-view')>(
    '@/lib/connectors/directory/snapshot-view',
  );
  return {
    isAuthProbeCandidate: (record: DirectoryRecord) =>
      record.authMode === 'unknown' && view.networkRemoteUrl(record) !== null,
    resolveAuthModeForRecord: (record: unknown) => mocks.resolveAuthModeForRecord(record),
  };
});
vi.mock('@/lib/connectors/directory/merge', () => ({
  buildInternalDirectoryRecords: () => mocks.internalRecords(),
  mergeDirectoryRecords: (internal: unknown[], registry: unknown[]) => [...internal, ...registry],
  unionCategories: (current: readonly string[], incoming: readonly string[]) => [
    ...new Set([...current, ...incoming]),
  ],
}));
vi.mock('@/lib/connectors/directory/first-party', () => ({
  applyFirstPartyTargets: (records: unknown[]) => records,
}));
vi.mock('@/lib/connectors/directory/normalize', async () => {
  const fixtures = await vi.importActual<typeof import('./fixtures')>('./fixtures');
  return {
    normalizeRegistryEntry: (entry: RegistryEntry) => {
      if (typeof entry.server.name !== 'string') throw new TypeError('malformed entry');
      const remotes = (entry.server.remotes ?? [])
        .filter((remote) => typeof remote.url === 'string')
        .map((remote) => ({ url: remote.url as string, transport: remote.type }));
      const packagesOnly = remotes.length === 0 && (entry.server.packages?.length ?? 0) > 0;
      if (remotes.length === 0 && !packagesOnly) return null;
      return fixtures.directoryRecord({
        id: entry.server.name,
        remotes,
        authMode: packagesOnly ? 'none' : 'unknown',
        connectable: packagesOnly ? 'desktop-and-cli' : 'needs-setup',
      });
    },
  };
});

import {
  ingestBudgetForMaxDuration,
  ingestConnectorDirectory,
  type IngestOptions,
} from '@/lib/connectors/directory/ingest';
import type { RegistryEntry } from '@/lib/connectors/directory/registry-client';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const CRON_ROUTE_MAX_DURATION_SECONDS = 800;
const WRITE_HEADROOM_MS = 120_000;
const SNAPSHOT_WRITE_HEADROOM_MS = 60_000;
const SITE_ICON_WINDOW_MS = 30_000;

function budget(crawlMs: number, probeMs: number, siteIconMs = probeMs + SITE_ICON_WINDOW_MS) {
  return { crawlMs, probeMs, siteIconMs, totalMs: siteIconMs + WRITE_HEADROOM_MS };
}

const GENEROUS_BUDGET = budget(60_000, 90_000);
const PAGE_MS = 1_000;
const PROBE_MS = 1_000;
const ICON_MS = 1_000;
const T0 = '2026-09-01T00:00:00.000Z';
const FAVICON_PATH = '/favicon.ico';

let clockMs = 0;
const now = () => clockMs;

function run(overrides: Partial<IngestOptions> = {}) {
  return ingestConnectorDirectory({ budget: GENEROUS_BUDGET, now, ...overrides });
}

function page(entries: unknown[], nextCursor?: string) {
  return {
    servers: entries,
    metadata: { count: entries.length, ...(nextCursor ? { nextCursor } : {}) },
  };
}

function activeEntry(
  name: string,
  remotes: unknown[] = [{ type: 'streamable-http', url: `https://${name}.example.com/mcp` }],
) {
  return {
    server: { name, description: `${name} description`, version: '1.0.0', remotes },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', isLatest: true } },
  };
}

function stdioEntry(name: string) {
  return activeEntry(name, [{ type: 'stdio', url: `stdio://${name}` }]);
}

function packagesEntry(name: string) {
  return {
    server: { name, description: `${name} description`, version: '1.0.0', packages: [{}] },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', isLatest: true } },
  };
}

function deletedEntry(name: string) {
  return {
    server: { name, description: `${name} description`, version: '1.0.0' },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deleted', isLatest: true } },
  };
}

function syncState(overrides: Record<string, unknown> = {}) {
  return {
    nextIngestCursor: null,
    bootstrapComplete: false,
    bootstrapStartedAt: null,
    lastSyncAt: null,
    authProbeCursor: null,
    siteIconCursor: null,
    ...overrides,
  };
}

function registryRecord(id: string, overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return directoryRecord({ id, ...overrides });
}

function siteOf(id: string): string {
  return `https://${id}.example.com`;
}

function siteRecord(id: string, overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return registryRecord(id, {
    authMode: 'oauth',
    connectable: 'connect',
    iconSource: 'site',
    websiteUrl: siteOf(id),
    ...overrides,
  });
}

function resolvedSiteRecord(id: string, overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  return siteRecord(id, { iconUrl: `${siteOf(id)}${FAVICON_PATH}`, ...overrides });
}

async function resolveIcon(record: DirectoryRecord): Promise<DirectoryRecord> {
  return { ...record, iconUrl: `${record.websiteUrl}${FAVICON_PATH}` };
}

function siteProbedIds(): string[] {
  return mocks.resolveSiteIconForRecord.mock.calls.map(
    ([record]) => (record as DirectoryRecord).id,
  );
}

function writtenSyncState() {
  return mocks.writeSyncState.mock.calls[0]?.[0];
}

function writtenSnapshot(): DirectoryRecord[] {
  return mocks.writeSnapshotRecords.mock.calls[0]?.[0] as DirectoryRecord[];
}

function probedIds(): string[] {
  return mocks.resolveAuthModeForRecord.mock.calls.map(
    ([record]) => (record as DirectoryRecord).id,
  );
}

describe('ingestBudgetForMaxDuration', () => {
  it('splits the function duration into a crawl phase, a probe phase and write headroom', () => {
    const derived = ingestBudgetForMaxDuration(300);
    expect(derived).toEqual({
      crawlMs: 180_000,
      probeMs: 240_000,
      siteIconMs: 270_000,
      totalMs: 300_000,
    });
    expect(derived.crawlMs).toBeLessThan(derived.probeMs);
    expect(derived.probeMs).toBeLessThan(derived.siteIconMs);
    expect(derived.siteIconMs).toBeLessThan(derived.totalMs);
  });

  it('gives a full-length pro function eight minutes of crawl and leaves the tail for the write', () => {
    const derived = ingestBudgetForMaxDuration(CRON_ROUTE_MAX_DURATION_SECONDS);
    expect(derived).toEqual({
      crawlMs: 480_000,
      probeMs: 640_000,
      siteIconMs: 720_000,
      totalMs: 800_000,
    });
    expect(derived.totalMs - derived.probeMs).toBeGreaterThanOrEqual(WRITE_HEADROOM_MS);
    expect(derived.totalMs - derived.siteIconMs).toBeGreaterThanOrEqual(SNAPSHOT_WRITE_HEADROOM_MS);
  });
});

describe('ingestConnectorDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clockMs = 0;
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
    mocks.resolveSiteIconForRecord.mockImplementation(async (record: unknown) => record);
    mocks.internalRecords.mockReturnValue([]);
    mocks.readSnapshotRecords.mockResolvedValue([]);
    mocks.readIngestLease.mockResolvedValue(null);
  });

  it('rebuilds from the first page when asked, even after a completed bootstrap', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: '2026-09-01T00:00:00.000Z' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    const summary = await run({ rebuild: true });

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: null,
    });
    expect(summary.mode).toBe('bootstrap');
    expect(summary.bootstrapComplete).toBe(true);
    expect(mocks.writeSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('bootstraps with no updated_since on the first run ever, and completes when exhausted in one page', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    const summary = await run();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: null,
    });
    expect(summary.mode).toBe('bootstrap');
    expect(summary.crawlStop).toBe('exhausted');
    expect(summary.bootstrapComplete).toBe(true);
    expect(summary.wroteSnapshot).toBe(true);
    expect(summary.entriesUpserted).toBe(1);
    expect(summary.totalRecords).toBe(1);

    const written = writtenSyncState();
    expect(written.nextIngestCursor).toBeNull();
    expect(written.bootstrapComplete).toBe(true);
    expect(written.bootstrapStartedAt).not.toBeNull();
    expect(written.lastSyncAt).toBe(written.bootstrapStartedAt);
    expect(mocks.writeSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('always writes during bootstrap even on a page with nothing new', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    const summary = await run();

    expect(summary.wroteSnapshot).toBe(true);
    expect(mocks.writeSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('switches to incremental mode with updated_since once bootstrap has completed', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0 }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    const summary = await run();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: T0,
    });
    expect(summary.mode).toBe('incremental');
    expect(summary.wroteSnapshot).toBe(true);

    const written = writtenSyncState();
    expect(written.bootstrapComplete).toBe(true);
    expect(written.nextIngestCursor).toBeNull();
    expect(written.lastSyncAt).not.toBe(T0);
  });

  it('skips the snapshot write when an incremental run finds zero changes but still advances the watermark', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0 }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    const summary = await run();

    expect(summary.wroteSnapshot).toBe(false);
    expect(mocks.writeSnapshotRecords).not.toHaveBeenCalled();
    expect(mocks.writeSyncState).toHaveBeenCalledTimes(1);
    const written = writtenSyncState();
    expect(written.lastSyncAt).not.toBe(T0);
    expect(written.bootstrapComplete).toBe(true);
  });

  it('writes when an incremental run finds a deletion, even with no upserts', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0 }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([deletedEntry('gone.example/mcp')]));
    mocks.readSnapshotRecords.mockResolvedValueOnce([
      registryRecord('gone.example/mcp', { authMode: 'oauth', connectable: 'connect' }),
    ]);

    const summary = await run();

    expect(summary.wroteSnapshot).toBe(true);
    expect(summary.entriesRemoved).toBe(1);
    expect(writtenSnapshot()).not.toContainEqual(
      expect.objectContaining({ id: 'gone.example/mcp' }),
    );
  });

  it('resumes a still-in-progress bootstrap from the persisted cursor', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ nextIngestCursor: 'existing.example/mcp:1.0.0' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    await run();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: 'existing.example/mcp:1.0.0',
      updatedSince: null,
    });
  });

  it('stops the crawl when the wall-clock budget is spent and persists the cursor to resume from', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    const pages = Array.from({ length: 10 }, (_, index) =>
      page([activeEntry(`filler-${index}`)], `filler-${index}:1.0.0`),
    );
    mocks.fetchRegistryPage.mockImplementation(async () => {
      clockMs += PAGE_MS;
      return pages.shift();
    });

    const summary = await run({ budget: budget(2_500, 90_000) });

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(3);
    expect(summary.crawlStop).toBe('budget');
    expect(summary.requestsUsed).toBe(3);
    expect(summary.entriesUpserted).toBe(3);
    expect(summary.bootstrapComplete).toBe(false);
    const written = writtenSyncState();
    expect(written.nextIngestCursor).toBe('filler-2:1.0.0');
    expect(written.bootstrapComplete).toBe(false);
    expect(written.lastSyncAt).toBeNull();
    expect(written.bootstrapStartedAt).not.toBeNull();
  });

  it('stamps the watermark with the bootstrap start once a resumed bootstrap finishes', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ nextIngestCursor: 'x:1.0.0', bootstrapStartedAt: T0 }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('last')]));

    const summary = await run();

    expect(summary.bootstrapComplete).toBe(true);
    const written = writtenSyncState();
    expect(written.lastSyncAt).toBe(T0);
    expect(written.bootstrapStartedAt).toBe(T0);
    expect(written.nextIngestCursor).toBeNull();
  });

  it('keeps the previous watermark when an incremental crawl runs out of budget', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0 }),
    );
    const pages = [
      page([activeEntry('one')], 'one:1.0.0'),
      page([activeEntry('two')], 'two:1.0.0'),
      page([activeEntry('three')], 'three:1.0.0'),
    ];
    mocks.fetchRegistryPage.mockImplementation(async () => {
      clockMs += PAGE_MS;
      return pages.shift();
    });

    const summary = await run({ budget: budget(1_500, 90_000) });

    expect(summary.crawlStop).toBe('budget');
    expect(summary.bootstrapComplete).toBe(true);
    const written = writtenSyncState();
    expect(written.lastSyncAt).toBe(T0);
    expect(written.nextIngestCursor).toBeNull();
  });

  it('stops paging once a fetch fails and keeps the cursor it failed at', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState({ nextIngestCursor: 'resume:1.0.0' }));
    mocks.fetchRegistryPage.mockRejectedValueOnce(new Error('network down'));

    const summary = await run();

    expect(summary.requestsUsed).toBe(0);
    expect(summary.crawlStop).toBe('error');
    expect(summary.bootstrapComplete).toBe(false);
    expect(writtenSyncState().nextIngestCursor).toBe('resume:1.0.0');
  });

  it('runs auth probes after the crawl under their own deadline and keeps unprobed records as unknown', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    const entries = Array.from({ length: 10 }, (_, index) => activeEntry(`server-${index}`));
    mocks.fetchRegistryPage.mockImplementation(async () => {
      clockMs += PAGE_MS;
      return page(entries);
    });
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: DirectoryRecord) => {
      clockMs += PROBE_MS;
      return { ...record, authMode: 'oauth', connectable: 'connect' };
    });

    const summary = await run({ budget: budget(10_000, 3_000) });

    expect(summary.crawlStop).toBe('exhausted');
    expect(summary.entriesSeen).toBe(10);
    expect(summary.entriesUpserted).toBe(10);
    expect(summary.authProbesRun).toBe(2);
    expect(summary.authProbesResolved).toBe(2);
    expect(summary.authProbeBacklog).toBe(8);
    const snapshot = writtenSnapshot();
    expect(snapshot.filter((record) => record.authMode === 'unknown')).toHaveLength(8);
    expect(snapshot.filter((record) => record.authMode === 'oauth')).toHaveLength(2);
  });

  it('caps probes per run at a floor plus a share of the entries crawled', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    const entries = Array.from({ length: 3_000 }, (_, index) => activeEntry(`server-${index}`));
    mocks.fetchRegistryPage.mockResolvedValueOnce(page(entries));
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: DirectoryRecord) => ({
      ...record,
      authMode: 'none',
      connectable: 'connect',
    }));

    const summary = await run();

    expect(summary.authProbesRun).toBe(2_750);
    expect(summary.authProbesResolved).toBe(2_750);
    expect(summary.entriesUpserted).toBe(3_000);
    expect(summary.authProbeBacklog).toBe(250);
  });

  it('never probes stdio-only or packages-only entries', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(
      page([stdioEntry('local-tool'), packagesEntry('npm-tool'), activeEntry('remote-tool')]),
    );

    const summary = await run();

    expect(summary.entriesUpserted).toBe(3);
    expect(summary.authProbesRun).toBe(1);
    expect(probedIds()).toEqual(['remote-tool']);
  });

  it('probes the unknown backlog from the existing snapshot on an incremental run, starting after the persisted cursor', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0, authProbeCursor: 'a' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));
    mocks.readSnapshotRecords.mockResolvedValueOnce([
      registryRecord('a'),
      registryRecord('b'),
      registryRecord('c'),
      registryRecord('already', { authMode: 'oauth', connectable: 'connect' }),
      directoryRecord({ id: 'internal', sourceRegistry: 'internal', badge: 'first-party' }),
    ]);
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: DirectoryRecord) => ({
      ...record,
      authMode: 'none',
      connectable: 'connect',
    }));

    const summary = await run();

    expect(probedIds()).toEqual(['b', 'c', 'a']);
    expect(summary.authProbesResolved).toBe(3);
    expect(summary.authProbeBacklog).toBe(0);
    expect(summary.wroteSnapshot).toBe(true);
    expect(writtenSyncState().authProbeCursor).toBe('a');
    expect(writtenSnapshot().find((record) => record.id === 'b')?.authMode).toBe('none');
  });

  it('persists where the backlog sweep stopped so the next run continues from there', async () => {
    const existing = ['a', 'b', 'c', 'd', 'e'].map((id) => registryRecord(id));
    mocks.readSnapshotRecords.mockResolvedValue(existing);
    mocks.fetchRegistryPage.mockImplementation(async () => {
      clockMs += PAGE_MS;
      return page([]);
    });
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: DirectoryRecord) => {
      clockMs += PROBE_MS;
      return record;
    });

    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0 }),
    );
    await run({ budget: budget(10_000, 3_000) });
    expect(probedIds()).toEqual(['a', 'b']);
    expect(mocks.writeSyncState.mock.calls[0]?.[0].authProbeCursor).toBe('b');

    clockMs = 0;
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0, authProbeCursor: 'b' }),
    );
    await run({ budget: budget(10_000, 3_000) });
    expect(probedIds().slice(2)).toEqual(['c', 'd']);
    expect(mocks.writeSyncState.mock.calls[1]?.[0].authProbeCursor).toBe('d');
  });

  it('skips a registry entry it cannot normalize, counts it, and keeps crawling', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    const malformed = {
      server: { description: 'no name', version: '1.0.0' },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', isLatest: true } },
    };
    mocks.fetchRegistryPage.mockResolvedValueOnce(
      page([activeEntry('before'), malformed, activeEntry('after')]),
    );

    const summary = await run();

    expect(summary.crawlStop).toBe('exhausted');
    expect(summary.entriesFailed).toBe(1);
    expect(summary.entriesUpserted).toBe(2);
    expect(writtenSnapshot().map((record) => record.id)).toEqual(['before', 'after']);
  });

  it('counts a failing probe and still finishes the run', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(
      page([activeEntry('flaky'), activeEntry('steady')]),
    );
    mocks.resolveAuthModeForRecord.mockRejectedValueOnce(new Error('cache down'));

    const summary = await run();

    expect(summary.authProbesRun).toBe(2);
    expect(summary.authProbeErrors).toBe(1);
    expect(summary.entriesUpserted).toBe(2);
    expect(mocks.writeSyncState).toHaveBeenCalledTimes(1);
  });
});

describe('site icon probes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clockMs = 0;
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
    mocks.resolveSiteIconForRecord.mockImplementation(resolveIcon);
    mocks.internalRecords.mockReturnValue([]);
    mocks.readSnapshotRecords.mockResolvedValue([]);
    mocks.readIngestLease.mockResolvedValue(null);
    mocks.readSyncState.mockResolvedValue(syncState({ bootstrapComplete: true, lastSyncAt: T0 }));
    mocks.fetchRegistryPage.mockResolvedValue(page([]));
  });

  it('probes featured records first, then official ones, then the backlog by id, skipping resolved and non-site icons', async () => {
    mocks.readSnapshotRecords.mockResolvedValue([
      siteRecord('zz-community'),
      siteRecord('official-b', { badge: 'official' }),
      siteRecord('featured-a', { featured: true }),
      siteRecord('community-a'),
      resolvedSiteRecord('done'),
      registryRecord('mono'),
    ]);

    const summary = await run();

    expect(siteProbedIds()).toEqual(['featured-a', 'official-b', 'community-a', 'zz-community']);
    expect(summary.siteIconProbesRun).toBe(4);
    expect(summary.siteIconProbesResolved).toBe(4);
    expect(summary.siteIconProbeBacklog).toBe(0);
    expect(summary.siteIconRecords).toBe(5);
    expect(summary.wroteSnapshot).toBe(true);
    expect(writtenSnapshot().find((record) => record.id === 'featured-a')?.iconUrl).toBe(
      `${siteOf('featured-a')}${FAVICON_PATH}`,
    );
    expect(writtenSnapshot().find((record) => record.id === 'mono')?.iconUrl).toBeNull();
    expect(writtenSyncState().siteIconCursor).toBe('zz-community');
  });

  it('stops at the site icon deadline, persists where it stopped, and resumes after the cursor', async () => {
    const existing = ['a', 'b', 'c', 'd', 'e'].map((id) => siteRecord(id));
    mocks.readSnapshotRecords.mockResolvedValue(existing);
    mocks.fetchRegistryPage.mockImplementation(async () => {
      clockMs += PAGE_MS;
      return page([]);
    });
    mocks.resolveSiteIconForRecord.mockImplementation(async (record: DirectoryRecord) => {
      clockMs += ICON_MS;
      return resolveIcon(record);
    });

    const first = await run({ budget: budget(10_000, 2_000, 3_000) });

    expect(siteProbedIds()).toEqual(['a', 'b']);
    expect(first.siteIconProbesRun).toBe(2);
    expect(first.siteIconProbeBacklog).toBe(3);
    expect(
      writtenSnapshot()
        .filter((record) => record.iconUrl !== null)
        .map((r) => r.id),
    ).toEqual(['a', 'b']);
    expect(mocks.writeSyncState.mock.calls[0]?.[0].siteIconCursor).toBe('b');

    clockMs = 0;
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0, siteIconCursor: 'b' }),
    );
    await run({ budget: budget(10_000, 2_000, 3_000) });

    expect(siteProbedIds().slice(2)).toEqual(['c', 'd']);
    expect(mocks.writeSyncState.mock.calls[1]?.[0].siteIconCursor).toBe('d');
  });

  it('caps site icon probes per run at a floor plus a share of the entries crawled', async () => {
    mocks.readSnapshotRecords.mockResolvedValue(
      Array.from({ length: 600 }, (_, index) =>
        siteRecord(`site-${String(index).padStart(3, '0')}`),
      ),
    );

    const summary = await run();

    expect(summary.siteIconProbesRun).toBe(500);
    expect(summary.siteIconProbesResolved).toBe(500);
    expect(summary.siteIconProbeBacklog).toBe(100);
    expect(writtenSyncState().siteIconCursor).toBe('site-499');
  });

  it('keeps the featured head ahead of the rotating backlog on every run', async () => {
    mocks.readSnapshotRecords.mockResolvedValue([
      siteRecord('a'),
      siteRecord('b'),
      siteRecord('c'),
      siteRecord('vendor', { featured: true }),
    ]);
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: T0, siteIconCursor: 'a' }),
    );

    await run();

    expect(siteProbedIds()).toEqual(['vendor', 'b', 'c', 'a']);
  });

  it('carries a resolved icon across the per-write rebuild of internal records instead of probing again', async () => {
    mocks.readSnapshotRecords.mockResolvedValue([
      resolvedSiteRecord('vendor-x', {
        sourceRegistry: 'internal',
        badge: 'official',
        featured: true,
      }),
    ]);
    mocks.internalRecords.mockReturnValue([
      siteRecord('vendor-x', { sourceRegistry: 'internal', badge: 'official', featured: true }),
    ]);

    const summary = await run({ rebuild: true });

    expect(siteProbedIds()).toEqual([]);
    expect(summary.siteIconProbesRun).toBe(0);
    expect(summary.siteIconRecords).toBe(1);
    expect(writtenSnapshot().find((record) => record.id === 'vendor-x')?.iconUrl).toBe(
      `${siteOf('vendor-x')}${FAVICON_PATH}`,
    );
  });

  it('probes again when the site behind a carried icon has moved', async () => {
    mocks.readSnapshotRecords.mockResolvedValue([
      resolvedSiteRecord('vendor-x', { sourceRegistry: 'internal', badge: 'official' }),
    ]);
    mocks.internalRecords.mockReturnValue([
      siteRecord('vendor-x', {
        sourceRegistry: 'internal',
        badge: 'official',
        websiteUrl: siteOf('vendor-x-moved'),
      }),
    ]);

    await run({ rebuild: true });

    expect(siteProbedIds()).toEqual(['vendor-x']);
    expect(writtenSnapshot().find((record) => record.id === 'vendor-x')?.iconUrl).toBe(
      `${siteOf('vendor-x-moved')}${FAVICON_PATH}`,
    );
  });

  it('does not write on an unchanged incremental run when no icon resolved, and counts a failing probe', async () => {
    mocks.readSnapshotRecords.mockResolvedValue([siteRecord('quiet'), siteRecord('flaky')]);
    mocks.resolveSiteIconForRecord
      .mockRejectedValueOnce(new Error('cache down'))
      .mockImplementationOnce(async (record: DirectoryRecord) => ({
        ...record,
        iconSource: 'monogram',
      }));

    const summary = await run();

    expect(summary.siteIconProbesRun).toBe(2);
    expect(summary.siteIconProbeErrors).toBe(1);
    expect(summary.siteIconProbesResolved).toBe(0);
    expect(summary.wroteSnapshot).toBe(false);
    expect(mocks.writeSnapshotRecords).not.toHaveBeenCalled();
    expect(writtenSyncState().siteIconCursor).toBe('quiet');
  });

  it('runs the site icon probes only after the auth probes and never counts one against the other', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('remote')]));
    mocks.readSnapshotRecords.mockResolvedValue([siteRecord('brand-site')]);
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: DirectoryRecord) => ({
      ...record,
      authMode: 'none',
      connectable: 'connect',
    }));

    const summary = await run();

    expect(probedIds()).toEqual(['remote']);
    expect(siteProbedIds()).toEqual(['brand-site']);
    expect(summary.authProbesRun).toBe(1);
    expect(summary.siteIconProbesRun).toBe(1);
    const authOrder = mocks.resolveAuthModeForRecord.mock.invocationCallOrder[0] ?? 0;
    const iconOrder = mocks.resolveSiteIconForRecord.mock.invocationCallOrder[0] ?? 0;
    expect(iconOrder).toBeGreaterThan(authOrder);
  });
});

describe('ingest lease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clockMs = 0;
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
    mocks.resolveSiteIconForRecord.mockImplementation(async (record: unknown) => record);
    mocks.internalRecords.mockReturnValue([]);
    mocks.readSnapshotRecords.mockResolvedValue([]);
    mocks.readIngestLease.mockResolvedValue(null);
    mocks.readSyncState.mockResolvedValue(syncState());
    mocks.fetchRegistryPage.mockResolvedValue(page([]));
  });

  it('refuses to start a second crawl while another run still holds the lease', async () => {
    const held = { startedAt: T0, expiresAt: '2026-09-01T00:13:20.000Z' };
    mocks.readIngestLease.mockResolvedValueOnce(held);

    await expect(run()).rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.fetchRegistryPage).not.toHaveBeenCalled();
    expect(mocks.writeIngestLease).not.toHaveBeenCalled();
    expect(mocks.writeSyncState).not.toHaveBeenCalled();
    expect(mocks.clearIngestLease).not.toHaveBeenCalled();
  });

  it('holds the lease for the whole function duration and releases it once the state is written', async () => {
    await run();

    expect(mocks.readIngestLease).toHaveBeenCalledWith(0);
    expect(mocks.writeIngestLease).toHaveBeenCalledWith({
      startedAt: new Date(0).toISOString(),
      expiresAt: new Date(GENEROUS_BUDGET.totalMs).toISOString(),
    });
    expect(mocks.clearIngestLease).toHaveBeenCalledTimes(1);
    const writeOrder = mocks.writeSyncState.mock.invocationCallOrder[0] ?? 0;
    const clearOrder = mocks.clearIngestLease.mock.invocationCallOrder[0] ?? 0;
    expect(clearOrder).toBeGreaterThan(writeOrder);
  });

  it('releases the lease even when the run fails partway', async () => {
    mocks.readSnapshotRecords.mockRejectedValueOnce(new Error('snapshot unavailable'));

    await expect(run()).rejects.toThrow('snapshot unavailable');

    expect(mocks.clearIngestLease).toHaveBeenCalledTimes(1);
  });
});
