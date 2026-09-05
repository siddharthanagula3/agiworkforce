import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  rateLimit: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.authUser }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from './route';

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/maps/tile/5/7/12', {
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function params(z: string, x: string, y: string) {
  return { params: Promise.resolve({ z, x, y }) };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.authUser.mockResolvedValue({ id: 'user-1' });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('GET /api/maps/tile/[z]/[x]/[y]', () => {
  it('proxies a valid tile with an identifying User-Agent', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }),
    );

    const response = await GET(request(), params('5', '7', '12'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age=604800');
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tile.openstreetmap.org/5/7/12.png');
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('AGIWorkforce');
  });

  it('follows the configured tile endpoint instead of the development default', async () => {
    vi.stubEnv('AGI_MAP_TILE_URL_TEMPLATE', 'https://tiles.example.com/v1/{z}/{x}/{y}@2x.png');
    mocks.fetch.mockResolvedValue(
      new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }),
    );

    const response = await GET(request(), params('5', '7', '12'));

    expect(response.status).toBe(200);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe('https://tiles.example.com/v1/5/7/12@2x.png');
    vi.unstubAllEnvs();
  });

  it.each([
    ['zoom below the served range', '1', '0', '0'],
    ['zoom above the served range', '20', '0', '0'],
    ['tile index outside the grid for its zoom', '2', '4', '0'],
    ['non-numeric index', '5', '7abc', '12'],
    ['negative index', '5', '-1', '12'],
  ])('rejects %s without calling upstream', async (_label, z, x, y) => {
    const response = await GET(request(), params(z, x, y));

    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses to re-serve a non-image upstream body', async () => {
    mocks.fetch.mockResolvedValue(
      new Response('<html>blocked</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const response = await GET(request(), params('5', '7', '12'));

    expect(response.status).toBe(502);
  });

  it('reports upstream failure rather than a broken image', async () => {
    mocks.fetch.mockResolvedValue(new Response('nope', { status: 429 }));

    const response = await GET(request(), params('5', '7', '12'));

    expect(response.status).toBe(502);
  });
});
