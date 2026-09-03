import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRegistryPage: vi.fn(),
  readDirectorySnapshot: vi.fn(),
  writeDirectorySnapshot: vi.fn(),
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
  readDirectorySnapshot: () => mocks.readDirectorySnapshot(),
  writeDirectorySnapshot: (...args: unknown[]) => mocks.writeDirectorySnapshot(...args),
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

function existingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'existing.example/mcp',
    sourceRegistry: 'mcp-registry',
    authMode: 'none',
    connectable: 'connect',
    remotes: [],
    toolNames: [],
    categories: [],
    name: 'existing',
    publisher: 'existing',
    description: 'd',
    repositoryUrl: null,
    version: null,
    badge: 'community',
    iconUrl: null,
    monogram: 'E',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

describe('ingestConnectorDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
  });

  it('bootstraps with no updated_since on the first run ever, and completes when exhausted in one page', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: null,
    });
    expect(summary.mode).toBe('bootstrap');
    expect(summary.bootstrapComplete).toBe(true);
    expect(summary.entriesUpserted).toBe(1);
    expect(summary.totalRecords).toBe(1);

    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.nextIngestCursor).toBeNull();
    expect(written.bootstrapComplete).toBe(true);
    expect(written.lastSyncAt).not.toBeNull();
  });

  it('resumes a still-in-progress bootstrap from the persisted cursor and can complete it', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [existingRecord()],
      nextIngestCursor: 'existing.example/mcp:1.0.0',
      bootstrapComplete: false,
      lastSyncAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: 'existing.example/mcp:1.0.0',
      updatedSince: null,
    });
    expect(summary.mode).toBe('bootstrap');
    expect(summary.bootstrapComplete).toBe(true);
    expect(summary.totalRecords).toBe(2);

    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.nextIngestCursor).toBeNull();
    expect(written.bootstrapComplete).toBe(true);
  });

  it('stays incomplete and persists the new cursor when a resumed bootstrap does not finish within budget', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [existingRecord()],
      nextIngestCursor: 'existing.example/mcp:1.0.0',
      bootstrapComplete: false,
      lastSyncAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(
      page([activeEntry('two')], 'two.example/mcp:1.0.0'),
    );
    for (let index = 0; index < 19; index += 1) {
      mocks.fetchRegistryPage.mockResolvedValueOnce(
        page([activeEntry(`filler-${index}`)], `filler-${index}:1.0.0`),
      );
    }

    const summary = await ingestConnectorDirectory();

    expect(summary.bootstrapComplete).toBe(false);
    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.bootstrapComplete).toBe(false);
    expect(written.nextIngestCursor).toBe('filler-18:1.0.0');
    expect(written.lastSyncAt).toBeNull();
  });

  it('switches to incremental mode with updated_since once bootstrap has completed', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [existingRecord()],
      nextIngestCursor: null,
      bootstrapComplete: true,
      lastSyncAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('two')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toEqual({
      cursor: null,
      updatedSince: '2026-09-01T00:00:00.000Z',
    });
    expect(summary.mode).toBe('incremental');
    expect(summary.totalRecords).toBe(2);

    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.bootstrapComplete).toBe(true);
    expect(written.nextIngestCursor).toBeNull();
    expect(written.lastSyncAt).not.toBe('2026-09-01T00:00:00.000Z');
  });

  it('removes a record an incremental crawl reports as deleted', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [existingRecord()],
      nextIngestCursor: null,
      bootstrapComplete: true,
      lastSyncAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([deletedEntry('existing.example/mcp')]));

    const summary = await ingestConnectorDirectory();

    expect(summary.entriesRemoved).toBe(1);
    expect(summary.totalRecords).toBe(0);
  });

  it('never touches the persisted cursor during an incremental run', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [],
      nextIngestCursor: null,
      bootstrapComplete: true,
      lastSyncAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    await ingestConnectorDirectory();

    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.nextIngestCursor).toBeNull();
  });

  it('stops paging once a fetch fails and still writes what it has so far', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
    mocks.fetchRegistryPage.mockRejectedValueOnce(new Error('network down'));

    const summary = await ingestConnectorDirectory();

    expect(summary.requestsUsed).toBe(0);
    expect(summary.totalRecords).toBe(0);
    expect(mocks.writeDirectorySnapshot).toHaveBeenCalledTimes(1);
  });

  it('enforces the declared per-run request budget without exhausting the crawl', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
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
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
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
