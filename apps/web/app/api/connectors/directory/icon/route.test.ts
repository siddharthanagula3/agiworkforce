import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const clientIpIdentifier = 'ip:203.0.113.7';
  return {
    clientIpIdentifier,
    getSnapshotRecords: vi.fn(),
    getIconForUrl: vi.fn(),
    withRateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
    clientIpRateLimitIdentifier: vi.fn((..._args: unknown[]) => clientIpIdentifier),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
  clientIpRateLimitIdentifier: (...args: unknown[]) => mocks.clientIpRateLimitIdentifier(...args),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/connectors/directory/memory-cache', () => ({
  getSnapshotRecords: () => mocks.getSnapshotRecords(),
}));
vi.mock('@/lib/connectors/directory/icon-fetch', () => ({
  getIconForUrl: (...args: unknown[]) => mocks.getIconForUrl(...args),
}));

import { GET } from './route';

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory/icon${query}`);
}

describe('GET /api/connectors/directory/icon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spends from the ip-keyed connector icon bucket, never the per-user conversation bucket', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce([]);
    const incoming = request('?id=notion');

    await GET(incoming);

    expect(mocks.clientIpRateLimitIdentifier).toHaveBeenCalledWith(incoming);
    expect(mocks.withRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      incoming,
      'connector-directory-icon',
      mocks.clientIpIdentifier,
    );
  });

  it('returns the limiter response when the icon bucket is exhausted', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));

    const response = await GET(request('?id=notion'));

    expect(response.status).toBe(429);
    expect(mocks.getSnapshotRecords).not.toHaveBeenCalled();
  });

  it('requires an id query parameter', async () => {
    const response = await GET(request(''));
    expect(response.status).toBe(400);
  });

  it('404s when the id is not in the snapshot', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce([]);

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
  });

  it('404s when the record has no recorded icon url', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce([{ id: 'notion', iconUrl: null }]);

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
    expect(mocks.getIconForUrl).not.toHaveBeenCalled();
  });

  it('404s when the icon could not be fetched', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce([
      { id: 'notion', iconUrl: 'https://cdn.example.com/notion.png' },
    ]);
    mocks.getIconForUrl.mockResolvedValueOnce(null);

    const response = await GET(request('?id=notion'));
    expect(response.status).toBe(404);
  });

  it('streams the cached icon bytes with the right content type', async () => {
    mocks.getSnapshotRecords.mockResolvedValueOnce([
      { id: 'notion', iconUrl: 'https://cdn.example.com/notion.png' },
    ]);
    mocks.getIconForUrl.mockResolvedValueOnce({
      contentType: 'image/png',
      base64: Buffer.from([1, 2, 3]).toString('base64'),
    });

    const response = await GET(request('?id=notion'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=2592000, immutable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});
