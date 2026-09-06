import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  withRateLimitMock,
  getNeonDbMock,
  listMock,
  getEntryMock,
  countInstallsMock,
  getSkillPluginOwnersMock,
  snapshotRecordsMock,
  findRecordMock,
} = vi.hoisted(() => ({
  withRateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  listMock: vi.fn(),
  getEntryMock: vi.fn(),
  countInstallsMock: vi.fn(),
  getSkillPluginOwnersMock: vi.fn(),
  snapshotRecordsMock: vi.fn(),
  findRecordMock: vi.fn(),
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
vi.mock('@/lib/services/plugin-installation-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/plugin-installation-service')>(
    '@/lib/services/plugin-installation-service',
  );
  return {
    ...actual,
    countPluginInstallations: countInstallsMock,
  };
});
vi.mock('@/lib/services/skill-catalog-service', () => ({
  getManagedSkillPluginOwners: getSkillPluginOwnersMock,
}));
vi.mock('@/features/plugins/server/directory/memory-cache', () => ({
  getPluginDirectoryRecords: snapshotRecordsMock,
  findPluginDirectoryRecord: findRecordMock,
}));

import { NextRequest } from 'next/server';
import { directoryEntry } from '@/features/plugins/server/directory/__tests__/fixtures';
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
  webInstallable: false,
  declaredSkills: ['Code Review'],
  requiredConnectors: ['github'],
  capabilities: ['connectors'],
  permissions: [],
  examplePrompts: [],
  versions: [],
  distribution: null,
  integrity: { sha256: null, signature: null, signatureAlgorithm: null },
  homepageUrl: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

const MARKETPLACE = directoryEntry();
const PARTNER = directoryEntry({
  id: 'sales',
  slug: 'sales',
  name: 'Sales',
  description: 'Pipeline reviews for Cowork.',
  publisher: { id: 'partner', name: 'Partner', kind: 'partner', url: null },
  sourceFacet: 'partner',
  installs: null,
  installCount: undefined,
  worksWith: ['cowork'],
  webInstallable: false,
  declaredSkills: [],
  sourceLocation: null,
});

function request(url: string): NextRequest {
  return new NextRequest(url, { headers: { origin: 'https://agiworkforce.com' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  withRateLimitMock.mockResolvedValue(null);
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
  listMock.mockResolvedValue({ entries: [ENTRY], total: 1 });
  getEntryMock.mockResolvedValue({ entry: ENTRY, manifest: null });
  countInstallsMock.mockResolvedValue(new Map());
  getSkillPluginOwnersMock.mockResolvedValue(new Map());
  snapshotRecordsMock.mockResolvedValue([MARKETPLACE, PARTNER]);
  findRecordMock.mockResolvedValue(null);
});

describe('GET /api/plugins', () => {
  it('serves built-in packs first, then the directory snapshot, with stats over everything', async () => {
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins?sort=name'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(3);
    expect(body.nextCursor).toBeNull();
    expect(body.entries.map((entry: { id: string }) => entry.id)).toEqual([
      'adobe-for-creativity',
      'github-automation',
      'sales',
    ]);
    expect(body.stats).toEqual({
      totalPlugins: 3,
      verified: 3,
      bySource: { builtin: 1, partner: 1, marketplace: 1 },
      byWorksWith: { 'claude-code': 1, cowork: 1, web: 1 },
    });
  });

  it('keeps every registry field on a built-in entry and adds the directory fields', async () => {
    const response = await listPlugins(
      request('https://agiworkforce.com/api/plugins?source=builtin'),
    );
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      ...ENTRY,
      installCount: 0,
      skillsRequireInstall: false,
      slug: 'github-automation',
      sourceFacet: 'builtin',
      verified: true,
      installs: 0,
      worksWith: [],
      installCommand: null,
    });
  });

  it('sorts by installs by default and pages with a cursor', async () => {
    const first = await listPlugins(request('https://agiworkforce.com/api/plugins?limit=1'));
    const firstBody = await first.json();
    expect(firstBody.entries[0].id).toBe('adobe-for-creativity');
    expect(firstBody.nextCursor).toBe('1');
    const second = await listPlugins(
      request(`https://agiworkforce.com/api/plugins?limit=1&cursor=${firstBody.nextCursor}`),
    );
    expect((await second.json()).entries[0].id).toBe('github-automation');
  });

  it('filters by search, verified, worksWith and source', async () => {
    const search = await listPlugins(request('https://agiworkforce.com/api/plugins?search=adobe'));
    expect((await search.json()).entries.map((e: { id: string }) => e.id)).toEqual([
      'adobe-for-creativity',
    ]);
    const cowork = await listPlugins(
      request('https://agiworkforce.com/api/plugins?worksWith=cowork'),
    );
    expect((await cowork.json()).entries.map((e: { id: string }) => e.id)).toEqual(['sales']);
    const partner = await listPlugins(
      request('https://agiworkforce.com/api/plugins?source=partner'),
    );
    expect((await partner.json()).total).toBe(1);
    const unverified = await listPlugins(
      request('https://agiworkforce.com/api/plugins?verified=false'),
    );
    expect((await unverified.json()).total).toBe(0);
  });

  it('marks skillsRequireInstall on marketplace entries that ship skills', async () => {
    const response = await listPlugins(
      request('https://agiworkforce.com/api/plugins?source=marketplace'),
    );
    const body = await response.json();
    expect(body.entries[0].skillsRequireInstall).toBe(true);
  });

  it('is publicly cacheable', async () => {
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.headers.get('cache-control')).toContain('public');
  });

  it('merges the real install count onto each built-in entry, defaulting to zero', async () => {
    countInstallsMock.mockResolvedValue(new Map([['github-automation', 7]]));
    const response = await listPlugins(
      request('https://agiworkforce.com/api/plugins?source=builtin'),
    );
    const body = await response.json();
    expect(body.entries[0].installCount).toBe(7);
    expect(body.entries[0].installs).toBe(7);
  });

  it('never leaks a user id through the install count', async () => {
    countInstallsMock.mockResolvedValue(new Map([['github-automation', 1]]));
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(JSON.stringify(await response.json())).not.toMatch(/user[_-]?id/i);
  });

  it('drops a snapshot entry whose id collides with a built-in pack', async () => {
    snapshotRecordsMock.mockResolvedValue([
      directoryEntry({ id: 'github-automation', slug: 'github-automation' }),
    ]);
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.entries[0].sourceFacet).toBe('builtin');
  });

  it('serves the built-in packs alone when the snapshot is empty', async () => {
    snapshotRecordsMock.mockResolvedValue([]);
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.stats.bySource).toEqual({ builtin: 1, partner: 0, marketplace: 0 });
  });

  it('reports 503 when the registry, the install count or the skill catalog fails', async () => {
    listMock.mockRejectedValueOnce(new Error('connection refused'));
    expect((await listPlugins(request('https://agiworkforce.com/api/plugins'))).status).toBe(503);
    countInstallsMock.mockRejectedValueOnce(new Error('connection refused'));
    expect((await listPlugins(request('https://agiworkforce.com/api/plugins'))).status).toBe(503);
    getSkillPluginOwnersMock.mockRejectedValueOnce(new Error('catalog unavailable'));
    const response = await listPlugins(request('https://agiworkforce.com/api/plugins'));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('PLUGIN_REGISTRY_UNAVAILABLE');
  });

  it('rejects an unknown source, works-with, sort or status with 400 and never queries', async () => {
    for (const query of [
      'source=vendor',
      'worksWith=desktop',
      'sort=newest',
      'status=installed',
      'verified=maybe',
    ]) {
      const response = await listPlugins(request(`https://agiworkforce.com/api/plugins?${query}`));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_QUERY');
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it('rejects a limit above the ceiling, a negative offset and a malformed cursor', async () => {
    for (const query of ['limit=1000', 'offset=-1', 'limit=abc', 'cursor=abc']) {
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
});

describe('GET /api/plugins/[id]', () => {
  it('serves the registry entry and a null manifest for a preview row', async () => {
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/github-automation'),
      { params: Promise.resolve({ id: 'github-automation' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entry.id).toBe('github-automation');
    expect(body.manifest).toBeNull();
  });

  it('falls back to the directory snapshot for a marketplace id', async () => {
    getEntryMock.mockResolvedValue(null);
    findRecordMock.mockResolvedValue(MARKETPLACE);
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/adobe-for-creativity'),
      { params: Promise.resolve({ id: 'adobe-for-creativity' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entry).toMatchObject({
      id: 'adobe-for-creativity',
      sourceFacet: 'marketplace',
      skillsRequireInstall: true,
    });
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

  it('computes skillsRequireInstall for the single entry the same way as the list', async () => {
    getEntryMock.mockResolvedValue({
      entry: { ...ENTRY, id: 'research-pack', declaredSkills: ['literature-review'] },
      manifest: null,
    });
    getSkillPluginOwnersMock.mockResolvedValue(new Map([['literature-review', 'research-pack']]));
    const response = await getPlugin(
      request('https://agiworkforce.com/api/plugins/research-pack'),
      { params: Promise.resolve({ id: 'research-pack' }) },
    );
    expect((await response.json()).entry.skillsRequireInstall).toBe(true);
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
