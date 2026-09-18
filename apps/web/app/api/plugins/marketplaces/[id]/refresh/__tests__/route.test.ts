import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userScopedDbMock, csrfMock, rateLimitMock, refreshMarketplaceSourceMock } = vi.hoisted(
  () => ({
    userScopedDbMock: vi.fn(),
    csrfMock: vi.fn(),
    rateLimitMock: vi.fn(),
    refreshMarketplaceSourceMock: vi.fn(),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  isMissingPluginMarketplaceSchema: (error: unknown) =>
    (error as { code?: string } | null)?.code === '42P01',
  refreshMarketplaceSource: refreshMarketplaceSourceMock,
}));

import { NextRequest } from 'next/server';
import { MARKETPLACE_UNAVAILABLE_MESSAGE } from '@/features/plugins/server/directory/constants';
import { POST } from '../route';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE = {
  id: SOURCE_ID,
  name: 'Acme internal tools',
  repositoryUrl: 'https://github.com/acme/tools',
  ref: 'main',
  status: 'active' as const,
  lastError: null,
  contentHash: 'a'.repeat(64),
  entryCount: 1,
  lastSyncedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

function undefinedTableError(): Error & { code: string } {
  return Object.assign(new Error('relation does not exist'), { code: '42P01' });
}

function post(id: string): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/plugins/marketplaces/${id}/refresh`, {
    method: 'POST',
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('POST /api/plugins/marketplaces/[id]/refresh', () => {
  it('refreshes and returns the updated source', async () => {
    refreshMarketplaceSourceMock.mockResolvedValue({ ...SOURCE, status: 'active' });
    const response = await POST(post(SOURCE_ID), params(SOURCE_ID));
    expect(response.status).toBe(200);
    expect((await response.json()).source.status).toBe('active');
    expect(refreshMarketplaceSourceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      SOURCE_ID,
    );
  });

  it('404s on a malformed id without calling the service', async () => {
    const response = await POST(post('not-a-uuid'), params('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(refreshMarketplaceSourceMock).not.toHaveBeenCalled();
  });

  it('404s when the source does not exist', async () => {
    refreshMarketplaceSourceMock.mockResolvedValue(null);
    const response = await POST(post(SOURCE_ID), params(SOURCE_ID));
    expect(response.status).toBe(404);
  });

  it('returns the csrf response and never refreshes when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(post(SOURCE_ID), params(SOURCE_ID));
    expect(response.status).toBe(403);
    expect(refreshMarketplaceSourceMock).not.toHaveBeenCalled();
  });

  it('answers 503 with the plain sentence while the marketplace schema is absent', async () => {
    refreshMarketplaceSourceMock.mockRejectedValue(undefinedTableError());
    const response = await POST(post(SOURCE_ID), params(SOURCE_ID));
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe(MARKETPLACE_UNAVAILABLE_MESSAGE);
  });
});
