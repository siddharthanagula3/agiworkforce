import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readDirectorySnapshot: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readDirectorySnapshot: () => mocks.readDirectorySnapshot(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from './route';

function makeSnapshot() {
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    nextIngestCursor: null,
    records: [
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
        docsUrl: null,
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
        toolNames: [],
        repositoryUrl: 'https://github.com/someone/tool',
        version: '1.0.0',
        sourceRegistry: 'mcp-registry',
        badge: 'community',
        iconUrl: 'https://cdn.example.com/tool.png',
        monogram: 'ST',
        docsUrl: 'https://example.com/docs',
      },
    ],
  };
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory${query}`);
}

describe('GET /api/connectors/directory', () => {
  it('returns every entry with pagination metadata when unfiltered', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.nextCursor).toBeNull();
  });

  it('filters by search across name, publisher and description', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request('?search=invoices'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('io.github.someone/tool');
  });

  it('filters to connectable-only entries', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request('?connectableOnly=true'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('notion');
  });

  it('filters by category', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request('?category=Financial+services'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('io.github.someone/tool');
  });

  it('paginates with a limit and hands back a cursor for the next page', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request('?limit=1'));
    const body = await response.json();

    expect(body.entries).toHaveLength(1);
    expect(body.nextCursor).toBe('1');
  });

  it('rejects an invalid query', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request('?limit=not-a-number'));
    expect(response.status).toBe(400);
  });

  it('carries the badge, icon url, monogram and docs url through unfiltered', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(makeSnapshot());

    const response = await GET(request());
    const body = await response.json();

    const tool = body.entries.find(
      (entry: { id: string }) => entry.id === 'io.github.someone/tool',
    );
    expect(tool).toMatchObject({
      badge: 'community',
      iconUrl: 'https://cdn.example.com/tool.png',
      monogram: 'ST',
      docsUrl: 'https://example.com/docs',
    });
  });

  it('returns an empty directory rather than failing when no snapshot has been ingested yet', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });
});
