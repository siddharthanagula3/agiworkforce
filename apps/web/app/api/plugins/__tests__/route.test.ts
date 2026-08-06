import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withRateLimitMock, getNeonDbMock, listMock, getEntryMock } = vi.hoisted(() => ({
  withRateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  listMock: vi.fn(),
  getEntryMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: withRateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/plugin-registry-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/plugin-registry-service')>(
    '@/lib/services/plugin-registry-service',
  );
  return {
    ...actual,
    listPluginRegistryEntries: listMock,
    getPluginRegistryEntry: getEntryMock,
  };
});

import { NextRequest } from 'next/server';
import { GET as listPlugins } from '../route';
import { GET as getPlugin } from '../[id]/route';

const ENTRY = {
  id: 'github-automation',
  name: 'GitHub Automation',
  version: '1.0.0',
  description: 'Automate pull request reviews.',
  category: 'Developer',
  publisher: { id: 'agi', name: 'AGI', kind: 'first-party', url: null },
  source: 'builtin',
  status: 'preview',
  declaredSkills: ['Code Review'],
  requiredConnectors: ['github'],
  capabilities: ['connectors'],
  permissions: [],
  versions: [],
  distribution: null,
  integrity: { sha256: null, signature: null, signatureAlgorithm: null },
  homepageUrl: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

function request(url: string): NextRequest {
  return new NextRequest(url, { headers: { origin: 'https://agiworkforce.com' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  withRateLimitMock.mockResolvedValue(null);
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
  listMock.mockResolvedValue({ entries: [ENTRY], total: 1 });
  getEntryMock.mockResolvedValue({ entry: ENTRY, manifest: null });
});

describe('GET /api/plugins', () => {
  it('serves the catalogue with a total', async () => {
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.entries[0].id).toBe('github-automation');
  });

  it('is publicly cacheable', async () => {
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.headers.get('cache-control')).toContain('public');
  });

  it('passes validated filters through to the service', async () => {
    await listPlugins(
      request(
        'https://agiworkforce.com/api/plugins?category=Developer&status=published&source=marketplace&limit=10&offset=20',
      ),
    );
    expect(listMock).toHaveBeenCalledWith(expect.anything(), {
      category: 'Developer',
      status: 'published',
      source: 'marketplace',
      limit: 10,
      offset: 20,
    });
  });

  it('rejects an out-of-union status with 400 and never queries', async () => {
    const response = await listPlugins(
      request('https://agiworkforce.com/api/plugins?status=installed'),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_QUERY');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('rejects a limit above the ceiling and a negative offset', async () => {
    for (const query of ['limit=1000', 'offset=-1', 'limit=abc']) {
      const response = await listPlugins(request(`https://agiworkforce.com/api/plugins?${query}`));
      expect(response.status).toBe(400);
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns the limiter response when rate limited, without querying', async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(null, { status: 429 }) as unknown as ReturnType<typeof Response.json>,
    );
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.status).toBe(429);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('reports 503 instead of an empty catalogue when the registry is down', async () => {
    listMock.mockRejectedValue(new Error('connection refused'));
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('PLUGIN_REGISTRY_UNAVAILABLE');
  });

  it('serves an empty catalogue as an empty list, not an error', async () => {
    listMock.mockResolvedValue({ entries: [], total: 0 });
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [], total: 0 });
  });
});

describe('GET /api/plugins/[id]', () => {
  it('serves the entry and a null manifest for a preview row', async () => {
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/github-automation'),
      { params: Promise.resolve({ id: 'github-automation' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entry.id).toBe('github-automation');
    expect(body.manifest).toBeNull();
  });

  it('404s an unknown id', async () => {
    getEntryMock.mockResolvedValue(null);
    const response = await getPlugin(request('https://agiworkforce.com/api/plugins/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(response.status).toBe(404);
  });

  it('404s a traversal or oversized id without touching the service', async () => {
    for (const id of ['../../etc/passwd', 'Upper', '.hidden', 'a'.repeat(200)]) {
      const response = await getPlugin(request('https://agiworkforce.com/api/plugins/x'), {
        params: Promise.resolve({ id }),
      });
      expect(response.status).toBe(404);
    }
    expect(getEntryMock).not.toHaveBeenCalled();
  });

  it('reports 503 when the registry read fails', async () => {
    getEntryMock.mockRejectedValue(new Error('down'));
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/github-automation'),
      { params: Promise.resolve({ id: 'github-automation' }) },
    );
    expect(response.status).toBe(503);
  });

  it('does not query when rate limited', async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(null, { status: 429 }) as unknown as ReturnType<typeof Response.json>,
    );
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/github-automation'),
      { params: Promise.resolve({ id: 'github-automation' }) },
    );
    expect(response.status).toBe(429);
    expect(getEntryMock).not.toHaveBeenCalled();
  });
});
