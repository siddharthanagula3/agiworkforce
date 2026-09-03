import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readDirectorySnapshot: vi.fn(),
  getIconForUrl: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readDirectorySnapshot: () => mocks.readDirectorySnapshot(),
}));
vi.mock('@/lib/connectors/directory/icon-fetch', () => ({
  getIconForUrl: (...args: unknown[]) => mocks.getIconForUrl(...args),
}));

import { GET } from './route';

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory/icon${query}`);
}

describe('GET /api/connectors/directory/icon', () => {
  it('requires an id query parameter', async () => {
    const response = await GET(request(''));
    expect(response.status).toBe(400);
  });

  it('404s when the id is not in the snapshot', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({ records: [] });

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
  });

  it('404s when the record has no recorded icon url', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [{ id: 'notion', iconUrl: null }],
    });

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });

  it('404s when the icon could not be fetched', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [{ id: 'notion', iconUrl: 'https://cdn.example.com/notion.png' }],
    });
    mocks.getIconForUrl.mockResolvedValueOnce(null);

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
  });

  it('streams the cached icon bytes with the right content type', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [{ id: 'notion', iconUrl: 'https://cdn.example.com/notion.png' }],
    });
    mocks.getIconForUrl.mockResolvedValueOnce({
      contentType: 'image/png',
      base64: Buffer.from([1, 2, 3]).toString('base64'),
    });

    const response = await GET(request('?id=notion'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});
