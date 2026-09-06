import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  csrfMock,
  rateLimitMock,
  getNeonDbMock,
  registerMarketplaceSourceMock,
  listMarketplaceSourcesMock,
  deleteMarketplaceSourceMock,
  refreshMarketplaceSourceMock,
  listMarketplaceEntriesForUserMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  registerMarketplaceSourceMock: vi.fn(),
  listMarketplaceSourcesMock: vi.fn(),
  deleteMarketplaceSourceMock: vi.fn(),
  refreshMarketplaceSourceMock: vi.fn(),
  listMarketplaceEntriesForUserMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));

import {
  PluginMarketplaceFetchError,
  PluginMarketplaceValidationError,
} from '@/lib/services/plugin-marketplace-service';

vi.mock('@/lib/services/plugin-marketplace-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/plugin-marketplace-service')>(
    '@/lib/services/plugin-marketplace-service',
  );
  return {
    ...actual,
    registerMarketplaceSource: registerMarketplaceSourceMock,
    listMarketplaceSources: listMarketplaceSourcesMock,
    deleteMarketplaceSource: deleteMarketplaceSourceMock,
    refreshMarketplaceSource: refreshMarketplaceSourceMock,
    listMarketplaceEntriesForUser: listMarketplaceEntriesForUserMock,
  };
});

import { NextRequest } from 'next/server';
import { GET as getEntries } from '../entries/route';
import { DELETE } from '../[id]/route';
import { POST as refresh } from '../[id]/refresh/route';
import { GET, POST } from '../route';

const SOURCE = {
  id: 'source-1',
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

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';

function undefinedTableError(): Error {
  return Object.assign(new Error('relation "public.plugin_marketplace_sources" does not exist'), {
    code: '42P01',
  });
}

function get(path = '/api/plugins/marketplaces'): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/marketplaces', {
    method: 'POST',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postNoBody(path: string): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    method: 'POST',
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function del(path: string): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    method: 'DELETE',
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authUserMock.mockResolvedValue({ userId: 'user-1' });
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
});

describe('GET /api/plugins/marketplaces', () => {
  it('lists the caller’s registered marketplace sources', async () => {
    listMarketplaceSourcesMock.mockResolvedValue([
      SOURCE,
      {
        ...SOURCE,
        id: 'shadow',
        repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      },
    ]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect((await response.json()).sources).toEqual([SOURCE]);
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    listMarketplaceSourcesMock.mockRejectedValue(undefinedTableError());
    const response = await GET(get());
    expect(response.status).toBe(503);
  });
});

describe('POST /api/plugins/marketplaces (register)', () => {
  it('registers a marketplace source and returns 201', async () => {
    registerMarketplaceSourceMock.mockResolvedValue(SOURCE);
    const response = await POST(post({ repositoryUrl: 'https://github.com/acme/tools' }));
    expect(response.status).toBe(201);
    expect((await response.json()).source).toEqual(SOURCE);
  });

  it('rejects a missing repository url with 400', async () => {
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect(registerMarketplaceSourceMock).not.toHaveBeenCalled();
  });

  it('surfaces a manifest validation error as 422 with issues', async () => {
    registerMarketplaceSourceMock.mockRejectedValue(
      new PluginMarketplaceValidationError(['acme-bundle references unknown skill "ghost"']),
    );
    const response = await POST(post({ repositoryUrl: 'https://github.com/acme/tools' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('MARKETPLACE_MANIFEST_INVALID');
    expect(body.error.issues).toHaveLength(1);
  });

  it('surfaces an unreachable marketplace as 502', async () => {
    registerMarketplaceSourceMock.mockRejectedValue(
      new PluginMarketplaceFetchError('No manifest found.'),
    );
    const response = await POST(post({ repositoryUrl: 'https://github.com/acme/tools' }));
    expect(response.status).toBe(502);
  });

  it('returns the csrf response and never registers when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(post({ repositoryUrl: 'https://github.com/acme/tools' }));
    expect(response.status).toBe(403);
    expect(registerMarketplaceSourceMock).not.toHaveBeenCalled();
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    registerMarketplaceSourceMock.mockRejectedValue(undefinedTableError());
    const response = await POST(post({ repositoryUrl: 'https://github.com/acme/tools' }));
    expect(response.status).toBe(503);
  });
});

describe('DELETE /api/plugins/marketplaces/[id]', () => {
  it('removes the source and returns 204', async () => {
    deleteMarketplaceSourceMock.mockResolvedValue(true);
    const response = await DELETE(del(`/api/plugins/marketplaces/${SOURCE_ID}`), params(SOURCE_ID));
    expect(response.status).toBe(204);
  });

  it('404s when the source does not exist', async () => {
    deleteMarketplaceSourceMock.mockResolvedValue(false);
    const response = await DELETE(del(`/api/plugins/marketplaces/${SOURCE_ID}`), params(SOURCE_ID));
    expect(response.status).toBe(404);
  });

  it('404s on a malformed id without calling the service', async () => {
    const response = await DELETE(
      del('/api/plugins/marketplaces/not-a-uuid'),
      params('not-a-uuid'),
    );
    expect(response.status).toBe(404);
    expect(deleteMarketplaceSourceMock).not.toHaveBeenCalled();
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    deleteMarketplaceSourceMock.mockRejectedValue(undefinedTableError());
    const response = await DELETE(del(`/api/plugins/marketplaces/${SOURCE_ID}`), params(SOURCE_ID));
    expect(response.status).toBe(503);
  });
});

describe('POST /api/plugins/marketplaces/[id]/refresh', () => {
  it('refreshes and returns the updated source', async () => {
    refreshMarketplaceSourceMock.mockResolvedValue({ ...SOURCE, status: 'active' });
    const response = await refresh(
      postNoBody(`/api/plugins/marketplaces/${SOURCE_ID}/refresh`),
      params(SOURCE_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).source.status).toBe('active');
  });

  it('404s when the source does not exist', async () => {
    refreshMarketplaceSourceMock.mockResolvedValue(null);
    const response = await refresh(
      postNoBody(`/api/plugins/marketplaces/${SOURCE_ID}/refresh`),
      params(SOURCE_ID),
    );
    expect(response.status).toBe(404);
  });
});

describe('GET /api/plugins/marketplaces/entries', () => {
  it('hides the entries of a directory shadow source', async () => {
    listMarketplaceSourcesMock.mockResolvedValue([
      SOURCE,
      {
        ...SOURCE,
        id: '99999999-9999-4999-8999-999999999999',
        repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      },
    ]);
    listMarketplaceEntriesForUserMock.mockResolvedValue([
      { id: 'own', sourceId: SOURCE.id },
      { id: 'shadow', sourceId: '99999999-9999-4999-8999-999999999999' },
    ]);
    const response = await getEntries(get('/api/plugins/marketplaces/entries'));
    expect(response.status).toBe(200);
    expect((await response.json()).entries.map((entry: { id: string }) => entry.id)).toEqual([
      'own',
    ]);
  });

  it('lists every entry across the caller’s sources', async () => {
    listMarketplaceSourcesMock.mockResolvedValue([SOURCE]);
    listMarketplaceEntriesForUserMock.mockResolvedValue([]);
    const response = await getEntries(get('/api/plugins/marketplaces/entries'));
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toEqual([]);
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    listMarketplaceEntriesForUserMock.mockRejectedValue(undefinedTableError());
    const response = await getEntries(get('/api/plugins/marketplaces/entries'));
    expect(response.status).toBe(503);
  });
});
