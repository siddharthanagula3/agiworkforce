import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { directoryRecord } from '@/lib/connectors/directory/__tests__/fixtures';
import {
  computeDirectoryCounts,
  orderDirectoryRecords,
  withDefaultBadge,
} from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const mocks = vi.hoisted(() => ({
  getSnapshotView: vi.fn(),
  withRateLimit: vi.fn(async (..._args: unknown[]) => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock('@/lib/connectors/directory/memory-cache', () => ({
  getSnapshotView: () => mocks.getSnapshotView(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from './route';

const LAST_SYNC_AT = '2026-09-05T06:15:00.000Z';

function records(): DirectoryRecord[] {
  return [
    directoryRecord({
      id: 'notion',
      name: 'Notion',
      publisher: 'Notion',
      description: 'Read and write Notion pages and notes.',
      categories: ['Productivity'],
      remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
      authMode: 'oauth',
      connectable: 'connect',
      sourceRegistry: 'internal',
      badge: 'first-party',
      monogram: 'N',
      iconSource: 'brand',
      brandSlug: 'notion',
      authorName: 'Notion',
    }),
    directoryRecord({
      id: 'slack',
      name: 'Slack',
      publisher: 'Slack',
      description: 'Send messages and read channels.',
      categories: ['Communication'],
      remotes: [{ url: 'https://mcp.slack.com/mcp', transport: 'streamable-http' }],
      authMode: 'oauth',
      connectable: 'connect',
      sourceRegistry: 'internal',
      badge: 'first-party',
      monogram: 'S',
      iconSource: 'brand',
      brandSlug: 'slack',
      authorName: 'Slack',
    }),
    directoryRecord({
      id: 'com.linear/mcp',
      name: 'Linear',
      publisher: 'linear',
      description: 'Plan and track issues.',
      categories: ['Code'],
      remotes: [{ url: 'https://mcp.linear.app/mcp', transport: 'streamable-http' }],
      authMode: 'oauth',
      connectable: 'connect',
      badge: 'official',
      iconUrl: 'https://cdn.example.com/linear.png',
      monogram: 'L',
      iconSource: 'registry',
    }),
    directoryRecord({
      id: 'io.github.someone/tool',
      name: 'Some Tool',
      publisher: 'someone',
      description: 'A community connector for shipping invoices.',
      categories: ['Financial services'],
      remotes: [{ url: 'https://tool.example.com/mcp', transport: 'streamable-http' }],
      authMode: 'api-key',
      connectable: 'api-key-form',
      toolNames: ['send_invoice', 'get_invoice'],
      repositoryUrl: 'https://github.com/someone/tool',
      version: '1.0.0',
      badge: 'registry',
      iconUrl: 'https://cdn.example.com/tool.png',
      monogram: 'ST',
      documentationUrl: 'https://example.com/docs',
      iconSource: 'registry',
      authorName: 'someone',
      authorUrl: 'https://github.com/someone',
      websiteUrl: 'https://example.com',
    }),
    directoryRecord({
      id: 'io.github.acme/bare',
      name: 'Bare Tool',
      publisher: 'acme',
      description: '',
      categories: ['Other'],
      remotes: [{ url: 'https://bare.example.com/mcp', transport: 'sse' }],
      authMode: 'unknown',
      connectable: 'needs-setup',
      badge: 'registry',
      monogram: 'BT',
    }),
    directoryRecord({
      id: 'com.example/notes',
      name: 'Notes MCP',
      publisher: 'example',
      description: 'Sync notes.',
      categories: ['Productivity'],
      remotes: [{ url: 'https://notes.example.com/mcp', transport: 'streamable-http' }],
      authMode: 'none',
      connectable: 'connect',
      badge: 'community',
      iconUrl: 'https://cdn.example.com/notes.png',
      monogram: 'NM',
      iconSource: 'registry',
    }),
    directoryRecord({
      id: 'com.example/cli-only',
      name: 'CLI Only',
      publisher: 'example',
      description: 'Runs locally.',
      categories: ['Code'],
      remotes: [],
      authMode: 'none',
      connectable: 'desktop-and-cli',
      badge: 'community',
      monogram: 'CO',
    }),
  ];
}

const DEFAULT_ORDER = [
  'notion',
  'slack',
  'com.linear/mcp',
  'io.github.someone/tool',
  'io.github.acme/bare',
  'com.example/notes',
  'com.example/cli-only',
];

function storedWithoutBadge(id: string): Omit<DirectoryRecord, 'badge'> {
  const { badge: _badge, ...rest } = directoryRecord({
    id,
    name: 'Legacy Tool',
    publisher: 'legacy',
    description: 'Persisted before badges existed.',
  });
  return rest;
}

function view(
  input: Omit<DirectoryRecord, 'badge'>[] = records(),
  overrides: Record<string, unknown> = {},
) {
  const ordered = orderDirectoryRecords(input.map(withDefaultBadge));
  return {
    records: ordered,
    counts: computeDirectoryCounts(ordered),
    bootstrapComplete: true,
    lastSyncAt: LAST_SYNC_AT,
    ...overrides,
  };
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory${query}`);
}

async function ids(query = ''): Promise<string[]> {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.entries.map((entry: { id: string }) => entry.id);
}

describe('GET /api/connectors/directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshotView.mockResolvedValue(view());
  });

  it('keeps spending from the per-user conversation bucket with no ip override', async () => {
    const incoming = request();

    await GET(incoming);

    expect(mocks.withRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(incoming, 'chat-conversation');
    expect(mocks.withRateLimit.mock.calls[0]).toHaveLength(2);
  });

  it('returns every entry in the default order with pagination metadata when unfiltered', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries.map((entry: { id: string }) => entry.id)).toEqual(DEFAULT_ORDER);
    expect(body.total).toBe(7);
    expect(body.nextCursor).toBeNull();
    expect(body.connectableModes).toEqual([
      'connect',
      'api-key-form',
      'desktop-and-cli',
      'needs-setup',
    ]);
    expect(body.categories).toContain('Productivity');
  });

  it('filters by search across name, publisher, description and tool names', async () => {
    await expect(ids('?search=invoices')).resolves.toEqual(['io.github.someone/tool']);
    await expect(ids('?search=someone')).resolves.toEqual(['io.github.someone/tool']);
    await expect(ids('?search=send_invoice')).resolves.toEqual(['io.github.someone/tool']);
    await expect(ids('?search=Bare')).resolves.toEqual(['io.github.acme/bare']);
  });

  it('ranks a name match ahead of a description match even across badge groups', async () => {
    await expect(ids('?search=notes')).resolves.toEqual(['com.example/notes', 'notion']);
  });

  it('filters by badge', async () => {
    await expect(ids('?badge=first-party')).resolves.toEqual(['notion', 'slack']);
    await expect(ids('?badge=official')).resolves.toEqual(['com.linear/mcp']);
    await expect(ids('?badge=verified')).resolves.toEqual([]);
    await expect(ids('?badge=registry')).resolves.toEqual([
      'io.github.someone/tool',
      'io.github.acme/bare',
    ]);
    await expect(ids('?badge=community')).resolves.toEqual([
      'com.example/notes',
      'com.example/cli-only',
    ]);
  });

  it('lists a registry record persisted without a badge under community', async () => {
    mocks.getSnapshotView.mockResolvedValue(
      view([...records(), storedWithoutBadge('io.github.legacy/tool')]),
    );

    await expect(ids('?badge=community')).resolves.toEqual([
      'com.example/notes',
      'com.example/cli-only',
      'io.github.legacy/tool',
    ]);
    const body = await (await GET(request('?badge=first-party'))).json();
    expect(body.stats.byBadge.community).toBe(3);
  });

  it('filters by one connectable mode', async () => {
    await expect(ids('?connectable=desktop-and-cli')).resolves.toEqual(['com.example/cli-only']);
    await expect(ids('?connectable=api-key-form')).resolves.toEqual(['io.github.someone/tool']);
  });

  it('keeps connectableOnly working as connect or api-key-form, and false means no filter', async () => {
    await expect(ids('?connectableOnly=true')).resolves.toEqual([
      'notion',
      'slack',
      'com.linear/mcp',
      'io.github.someone/tool',
      'com.example/notes',
    ]);
    await expect(ids('?connectableOnly=false')).resolves.toEqual(DEFAULT_ORDER);
  });

  it('filters by auth mode', async () => {
    await expect(ids('?authMode=unknown')).resolves.toEqual(['io.github.acme/bare']);
    await expect(ids('?authMode=oauth')).resolves.toEqual(['notion', 'slack', 'com.linear/mcp']);
  });

  it('filters by category', async () => {
    await expect(ids('?category=Financial+services')).resolves.toEqual(['io.github.someone/tool']);
    await expect(ids('?category=Productivity')).resolves.toEqual(['notion', 'com.example/notes']);
  });

  it('combines filters', async () => {
    await expect(ids('?badge=community&connectableOnly=true')).resolves.toEqual([
      'com.example/notes',
    ]);
  });

  it('sorts by name on request', async () => {
    await expect(ids('?sort=name')).resolves.toEqual([
      'io.github.acme/bare',
      'com.example/cli-only',
      'com.linear/mcp',
      'com.example/notes',
      'notion',
      'slack',
      'io.github.someone/tool',
    ]);
  });

  it('paginates with a limit and hands back an offset cursor for the next page', async () => {
    const first = await GET(request('?limit=2'));
    const firstBody = await first.json();
    expect(firstBody.entries.map((entry: { id: string }) => entry.id)).toEqual(['notion', 'slack']);
    expect(firstBody.total).toBe(7);
    expect(firstBody.nextCursor).toBe('2');

    await expect(ids('?limit=2&cursor=2')).resolves.toEqual([
      'com.linear/mcp',
      'io.github.someone/tool',
    ]);
    const last = await GET(request('?limit=2&cursor=6'));
    const lastBody = await last.json();
    expect(lastBody.entries).toHaveLength(1);
    expect(lastBody.nextCursor).toBeNull();
  });

  it('rejects an invalid query without ever reading the snapshot', async () => {
    for (const query of [
      '?limit=not-a-number',
      '?badge=platinum',
      '?sort=random',
      '?connectable=maybe',
      '?connectableOnly=yes',
      '?limit=500',
    ]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
    }
    expect(mocks.getSnapshotView).not.toHaveBeenCalled();
  });

  it('reports whole-snapshot stats regardless of the filter or page', async () => {
    const response = await GET(request('?badge=community&limit=1'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.total).toBe(2);
    expect(body.stats).toEqual({
      totalRecords: 7,
      remoteRecords: 6,
      byConnectable: { connect: 4, 'api-key-form': 1, 'desktop-and-cli': 1, 'needs-setup': 1 },
      byBadge: { 'first-party': 2, official: 1, verified: 0, registry: 2, community: 2 },
      bootstrapComplete: true,
      lastSyncAt: LAST_SYNC_AT,
    });
  });

  it('surfaces an in-progress bootstrap through the stats', async () => {
    mocks.getSnapshotView.mockResolvedValue(
      view(records(), { bootstrapComplete: false, lastSyncAt: null }),
    );

    const body = await (await GET(request())).json();
    expect(body.stats.bootstrapComplete).toBe(false);
    expect(body.stats.lastSyncAt).toBeNull();
  });

  it('carries every record field plus the computed tool count and connector url', async () => {
    const response = await GET(request());
    const body = await response.json();

    const tool = body.entries.find(
      (entry: { id: string }) => entry.id === 'io.github.someone/tool',
    );
    expect(tool).toMatchObject({
      badge: 'registry',
      iconUrl: 'https://cdn.example.com/tool.png',
      monogram: 'ST',
      documentationUrl: 'https://example.com/docs',
      iconSource: 'registry',
      authorName: 'someone',
      authorUrl: 'https://github.com/someone',
      websiteUrl: 'https://example.com',
      toolCount: 2,
      connectorUrl: 'https://tool.example.com/mcp',
    });
  });

  it('returns an empty directory rather than failing when nothing has been ingested yet', async () => {
    mocks.getSnapshotView.mockResolvedValue(
      view([], { bootstrapComplete: false, lastSyncAt: null }),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.stats.totalRecords).toBe(0);
    expect(body.stats.byBadge).toEqual({
      'first-party': 0,
      official: 0,
      verified: 0,
      registry: 0,
      community: 0,
    });
  });

  it('returns 503 when the snapshot cache throws', async () => {
    mocks.getSnapshotView.mockRejectedValueOnce(new Error('connection refused'));

    const response = await GET(request());
    expect(response.status).toBe(503);
  });
});
