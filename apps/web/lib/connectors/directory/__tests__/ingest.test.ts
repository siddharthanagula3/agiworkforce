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

describe('ingestConnectorDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthModeForRecord.mockImplementation(async (record: unknown) => record);
  });

  it('starts from an empty cursor on the first run and stops when the registry is exhausted', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([activeEntry('one')]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toBeNull();
    expect(summary.cursorExhausted).toBe(true);
    expect(summary.entriesNormalized).toBe(1);
    expect(summary.totalRecords).toBe(1);

    const written = mocks.writeDirectorySnapshot.mock.calls[0]?.[0];
    expect(written.nextIngestCursor).toBeNull();
    expect(written.records).toHaveLength(1);
  });

  it('resumes from the persisted cursor and merges with previously ingested registry records', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [
        {
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
          docsUrl: null,
        },
      ],
      nextIngestCursor: 'existing.example/mcp:1.0.0',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.fetchRegistryPage.mockResolvedValueOnce(
      page([activeEntry('two')], 'two.example/mcp:1.0.0'),
    );
    mocks.fetchRegistryPage.mockResolvedValueOnce(page([]));

    const summary = await ingestConnectorDirectory();

    expect(mocks.fetchRegistryPage.mock.calls[0]?.[0]).toBe('existing.example/mcp:1.0.0');
    expect(summary.totalRecords).toBe(2);
  });

  it('stops paging once a fetch fails and still writes what it has so far', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);
    mocks.fetchRegistryPage.mockRejectedValueOnce(new Error('network down'));

    const summary = await ingestConnectorDirectory();

    expect(summary.pagesFetched).toBe(0);
    expect(summary.totalRecords).toBe(0);
    expect(mocks.writeDirectorySnapshot).toHaveBeenCalledTimes(1);
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
