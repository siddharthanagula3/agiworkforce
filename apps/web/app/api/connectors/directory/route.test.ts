import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSnapshotRecords: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/connectors/directory/memory-cache', () => ({
  getSnapshotRecords: () => mocks.getSnapshotRecords(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from './route';

function records() {
  return [
    {
      id: 'notion',
      name: 'Notion',
      publisher: 'Notion',
      description: 'Read and write Notion pages.',
      categories: ['Productivity'],
      remotes: [{ url: 'https://mcp.notion.com/mcp', transport: 'streamable-http' }],
      authMode: 'oauth',
      connectable: 'connect',
      toolNames: [],
      repositoryUrl: null,
      version: null,
      sourceRegistry: 'internal',
      badge: 'first-party',
      iconUrl: null,
      monogram: 'N',
      documentationUrl: null,
      iconSource: 'brand',
      brandSlug: 'notion',
      authorName: 'Notion',
      authorUrl: null,
      websiteUrl: null,
      supportUrl: null,
      privacyPolicyUrl: null,
    },
    {
      id: 'io.github.someone/tool',
      name: 'Some Tool',
      publisher: 'someone',
      description: 'A community connector for shipping invoices.',
      categories: ['Financial services'],
      remotes: [{ url: 'https://tool.example.com/mcp', transport: 'streamable-http' }],
      authMode: 'unknown',
      connectable: 'needs-setup',
      toolNames: ['send_invoice', 'get_invoice'],
      repositoryUrl: 'https://github.com/someone/tool',
      version: '1.0.0',
      sourceRegistry: 'mcp-registry',
      badge: 'community',
      iconUrl: 'https://cdn.example.com/tool.png',
      monogram: 'ST',
      documentationUrl: 'https://example.com/docs',
      iconSource: 'registry',
      brandSlug: null,
      authorName: 'someone',
      authorUrl: 'https://github.com/someone',
      websiteUrl: 'https://example.com',
      supportUrl: null,
      privacyPolicyUrl: null,
    },
  ];
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory${query}`);
}

describe('GET /api/connectors/directory', () => {
  it('returns every entry with pagination metadata when unfiltered', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.nextCursor).toBeNull();
  });

  it('filters by search across name, publisher and description', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request('?search=invoices'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('io.github.someone/tool');
  });

  it('filters to connectable-only entries', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request('?connectableOnly=true'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('notion');
  });

  it('filters by category', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request('?category=Financial+services'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('io.github.someone/tool');
  });

  it('paginates with a limit and hands back a cursor for the next page', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request('?limit=1'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.nextCursor).toBe('1');
  });

  it('rejects an invalid query without ever calling the snapshot cache', async () => {
    const response = await GET(request('?limit=not-a-number'));

    expect(response.status).toBe(400);
    expect(mocks.getSnapshotRecords).not.toHaveBeenCalled();
  });

  it('carries every record field plus the computed tool count and connector url', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce(records());

    const response = await GET(request());
    const body = await response.json();

    const tool = body.entries.find(
      (entry: { id: string }) => entry.id === 'io.github.someone/tool',
    );
    expect(tool).toMatchObject({
      badge: 'community',
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
    mocks.getSnapshotRecords.mockResolvedValueOnce([]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns 503 when the snapshot cache throws', async () => {
    mocks.getSnapshotRecords.mockRejectedValueOnce(new Error('connection refused'));

    const response = await GET(request());
    expect(response.status).toBe(503);
  });
});
