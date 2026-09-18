import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userScopedDbMock, rateLimitMock, listPluginUpdateOffersMock } = vi.hoisted(() => ({
  userScopedDbMock: vi.fn(),
  rateLimitMock: vi.fn(),
  listPluginUpdateOffersMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/services/plugin-lifecycle', () => ({
  listPluginUpdateOffers: listPluginUpdateOffersMock,
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

function get(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/updates');
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/plugins/updates', () => {
  it('reports the caller’s pending plugin update offers', async () => {
    listPluginUpdateOffersMock.mockResolvedValue([
      { pluginId: 'research-pack', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updates).toEqual([
      { pluginId: 'research-pack', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ]);
    expect(listPluginUpdateOffersMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('returns the limiter response when rate limited, without listing', async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(listPluginUpdateOffersMock).not.toHaveBeenCalled();
  });
});
