import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRegistryPage: vi.fn(),
  readSnapshotRecords: vi.fn(),
  writeSnapshotRecords: vi.fn(),
  readSyncState: vi.fn(),
  writeSyncState: vi.fn(),
  resolveAuthModeForRecord: vi.fn(),
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
}));
vi.mock('@/lib/connectors/directory/auth-probe', () => ({
  resolveAuthModeForRecord: (record: unknown) => mocks.resolveAuthModeForRecord(record),
}));
vi.mock('@/lib/connectors/directory/merge', () => ({
  buildInternalDirectoryRecords: () => [],
  mergeDirectoryRecords: (internal: unknown[], registry: unknown[]) => [...internal, ...registry],
}));
vi.mock('@/lib/connectors/directory/first-party', () => ({
  applyFirstPartyTargets: (records: unknown[]) => records,
}));

import { ingestConnectorDirectory } from '@/lib/connectors/directory/ingest';

function page(entries: unknown[], nextCursor?: string) {
  return {
    servers: entries,
    metadata: { count: entries.length, ...(nextCursor ? { nextCursor } : {}) },
  };
}

function activeEntry(name: string) {
  return {
    server: {
      name,
      description: `${name} description`,
      version: '1.0.0',
      remotes: [{ type: 'streamable-http', url: `https://${name}.example.com/mcp` }],
    },
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
  return { nextIngestCursor: null, bootstrapComplete: false, lastSyncAt: null, ...overrides };
}

describe('ingestConnectorDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
    mocks.readSnapshotRecords.mockResolvedValue([]);
  });

  it('bootstraps with no updated_since on the first run ever, and completes when exhausted in one page', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: null,
    });
    expect(summary.mode).toBe('bootstrap');
    expect(summary.bootstrapComplete).toBe(true);
    expect(summary.wroteSnapshot).toBe(true);
    expect(summary.entriesUpserted).toBe(1);
    expect(summary.totalRecords).toBe(1);

    const written = mocks.writeSyncState.mock.calls[0]?.[0];
    expect(written.nextIngestCursor).toBeNull();
    expect(written.bootstrapComplete).toBe(true);
    expect(written.lastSyncAt).not.toBeNull();
    expect(mocks.writeSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('always writes during bootstrap even on a page with nothing new', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    const summary = await ingestConnectorDirectory();

    expect(summary.wroteSnapshot).toBe(true);
    expect(mocks.writeSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('switches to incremental mode with updated_since once bootstrap has completed', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: '2026-09-01T00:00:00.000Z' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: '2026-09-01T00:00:00.000Z',
    });
    expect(summary.mode).toBe('incremental');
    expect(summary.wroteSnapshot).toBe(true);

    const written = mocks.writeSyncState.mock.calls[0]?.[0];
    expect(written.bootstrapComplete).toBe(true);
    expect(written.nextIngestCursor).toBeNull();
    expect(written.lastSyncAt).not.toBe('2026-09-01T00:00:00.000Z');
  });

  it('skips the snapshot write entirely when an incremental run finds zero changes', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: '2026-09-01T00:00:00.000Z' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    const summary = await ingestConnectorDirectory();

    expect(summary.wroteSnapshot).toBe(false);
    expect(mocks.writeSnapshotRecords).not.toHaveBeenCalled();
    expect(mocks.readSnapshotRecords).not.toHaveBeenCalled();
    expect(mocks.writeSyncState).toHaveBeenCalledTimes(1);
  });

  it('still advances the sync watermark on a zero-change incremental run', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: '2026-09-01T00:00:00.000Z' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    await ingestConnectorDirectory();

    const written = mocks.writeSyncState.mock.calls[0]?.[0];
    expect(written.lastSyncAt).not.toBe('2026-09-01T00:00:00.000Z');
    expect(written.bootstrapComplete).toBe(true);
  });

  it('writes when an incremental run finds a deletion, even with no upserts', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ bootstrapComplete: true, lastSyncAt: '2026-09-01T00:00:00.000Z' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([deletedEntry('gone.example/mcp')]));
    mocks.readSnapshotRecords.mockResolvedValueOnce([
      { id: 'gone.example/mcp', sourceRegistry: 'mcp-registry' },
    ]);

    const summary = await ingestConnectorDirectory();

    expect(summary.wroteSnapshot).toBe(true);
    expect(summary.entriesRemoved).toBe(1);
    const written = mocks.writeSnapshotRecords.mock.calls[0]?.[0];
    expect(written).not.toContainEqual(expect.objectContaining({ id: 'gone.example/mcp' }));
  });

  it('resumes a still-in-progress bootstrap from the persisted cursor', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ nextIngestCursor: 'existing.example/mcp:1.0.0' }),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: 'existing.example/mcp:1.0.0',
      updatedSince: null,
    });
  });

  it('stays incomplete and persists the new cursor when a resumed bootstrap does not finish within budget', async () => {
    mocks.readSyncState.mockResolvedValueOnce(
      syncState({ nextIngestCursor: 'existing.example/mcp:1.0.0' }),
    );
    for (let index = 0; index < 20; index += 1) {
      mocks.fetchRegistryPage.mockResolvedValueOnce(
        page([activeEntry(`filler-${index}`)], `filler-${index}:1.0.0`),
      );
    }

    const summary = await ingestConnectorDirectory();

    expect(summary.bootstrapComplete).toBe(false);
    const written = mocks.writeSyncState.mock.calls[0]?.[0];
    expect(written.bootstrapComplete).toBe(false);
    expect(written.nextIngestCursor).toBe('filler-19:1.0.0');
    expect(written.lastSyncAt).toBeNull();
  });

  it('stops paging once a fetch fails and still records the run', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    mocks.fetchRegistryPage.mockRejectedValueOnce(new Error('network down'));

    const summary = await ingestConnectorDirectory();

    expect(summary.requestsUsed).toBe(0);
    expect(mocks.writeSyncState).toHaveBeenCalledTimes(1);
  });

  it('enforces the declared per-run request budget without exhausting the crawl', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    for (let index = 0; index < 25; index += 1) {
      mocks.fetchRegistryPage.mockResolvedValueOnce(
        page([activeEntry(`server-${index}`)], `server-${index}:1.0.0`),
      );
    }

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(20);
    expect(summary.bootstrapComplete).toBe(false);
    expect(summary.requestsUsed).toBe(20);
  });

  it('caps the number of auth probes run in a single invocation', async () => {
    mocks.readSyncState.mockResolvedValueOnce(syncState());
    const entries = Array.from({ length: 5 }, (_, index) => activeEntry(`server-${index}`));
    mocks.fetchRegistryPage.mockResolvedValueOnce(page(entries));
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: { authMode: string }) => ({
      ...record,
      authMode: 'oauth',
      connectable: 'connect',
    }));

    const summary = await ingestConnectorDirectory();

    expect(summary.authProbesRun).toBe(5);
    expect(mocks.resolveAuthModeForRecord).toHaveBeenCalledTimes(5);
  });
});
