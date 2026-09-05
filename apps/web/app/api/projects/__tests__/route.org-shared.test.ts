import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockRlsQuery,
  mockNeonQuery,
  mockResolveSharedProjectScope,
  mockResolveActiveOrganizationId,
} = vi.hoisted(() => ({
  mockRlsQuery: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockResolveSharedProjectScope: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockRlsQuery(...args) },
    userId: 'member-1',
    organizationId: await mockResolveActiveOrganizationId(),
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveSharedProjectScope: mockResolveSharedProjectScope,
}));

import { GET as LIST_PROJECTS } from '../route';
import { GET as GET_PROJECT } from '../[id]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const SHARED_PROJECT = '33333333-3333-4333-8333-333333333333';
const FOREIGN_PROJECT = '55555555-5555-4555-8555-555555555555';

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SHARED_PROJECT,
    user_id: 'owner-1',
    name: 'Roadmap',
    description: '',
    instructions: '',
    color: '#3b82f6',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    conversation_count: 0,
    ...overrides,
  };
}

function listRequest(): never {
  return new Request('http://localhost:3000/api/projects') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSharedProjectScope.mockResolvedValue(null);
  mockResolveActiveOrganizationId.mockResolvedValue(null);
});

describe('GET /api/projects · shared projects', () => {
  it.each([
    ['Personal', null],
    ['organization', ORG],
  ] as const)('scopes owned rows to the active %s workspace', async (_label, organizationId) => {
    mockResolveActiveOrganizationId.mockResolvedValue(organizationId);
    mockRlsQuery.mockResolvedValue([]);

    await LIST_PROJECTS(listRequest());

    const [sql, params] = mockRlsQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/p\.organization_id is not distinct from \$5::uuid/i);
    expect(params[4]).toBe(organizationId);
  });

  it('reads the owned-or-shared row set through the caller-scoped connection', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockResolveActiveOrganizationId.mockResolvedValue(ORG);
    mockRlsQuery.mockResolvedValue([projectRow({ is_org_shared: true })]);

    const response = await LIST_PROJECTS(listRequest());

    expect(response.status).toBe(200);
    expect(mockRlsQuery).toHaveBeenCalledTimes(1);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('binds the server-derived shared id set and keeps the ownership predicate', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockResolveActiveOrganizationId.mockResolvedValue(ORG);
    mockRlsQuery.mockResolvedValue([projectRow({ is_org_shared: true })]);

    const response = await LIST_PROJECTS(listRequest());
    expect(response.status).toBe(200);

    const [sql, params] = mockRlsQuery.mock.calls[0]!;
    expect(sql).toMatch(/p\.user_id = \$1 or p\.id = any\(\$4::uuid\[\]\)/i);
    expect(sql).toMatch(/p\.organization_id is not distinct from \$5::uuid/i);
    expect((params as unknown[])[0]).toBe('member-1');
    expect((params as unknown[])[3]).toEqual([SHARED_PROJECT]);
    expect((params as unknown[])[4]).toBe(ORG);
  });

  it('binds an EMPTY id set for a user in no organization, so nothing widens', async () => {
    mockRlsQuery.mockResolvedValue([]);

    await LIST_PROJECTS(listRequest());

    const [, params] = mockRlsQuery.mock.calls[0]!;
    expect((params as unknown[])[3]).toEqual([]);
  });

  it('keeps conversations personal inside a shared project', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockRlsQuery.mockResolvedValue([projectRow({ is_org_shared: true })]);

    await LIST_PROJECTS(listRequest());

    const [sql] = mockRlsQuery.mock.calls[0]!;
    expect(sql).toMatch(/from web_conversations c[\s\S]*?and c\.user_id = \$1/i);
  });

  it('marks a shared project so a client does not render owner-only controls', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockResolveActiveOrganizationId.mockResolvedValue(ORG);
    mockRlsQuery.mockResolvedValue([
      projectRow({ is_org_shared: true }),
      projectRow({ id: 'own-1', user_id: 'member-1', is_org_shared: false }),
    ]);

    const response = await LIST_PROJECTS(listRequest());
    const body = (await response.json()) as { projects: { id: string; isOrgShared: boolean }[] };

    expect(body.projects.find((p) => p.id === SHARED_PROJECT)?.isOrgShared).toBe(true);
    expect(body.projects.find((p) => p.id === 'own-1')?.isOrgShared).toBe(false);
  });
});

describe('GET /api/projects/[id] · shared project detail', () => {
  function detailRequest(id: string): never {
    return new Request(`http://localhost:3000/api/projects/${id}`) as never;
  }

  it('falls back to the shared read only after the owner read misses, still caller-scoped', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockResolveActiveOrganizationId.mockResolvedValue(ORG);
    mockRlsQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([projectRow({ is_org_shared: true })]);

    const response = await GET_PROJECT(detailRequest(SHARED_PROJECT), {
      params: Promise.resolve({ id: SHARED_PROJECT }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { project: { id: string; isOrgShared: boolean } };
    expect(body.project.isOrgShared).toBe(true);

    expect(mockRlsQuery).toHaveBeenCalledTimes(2);
    expect(mockNeonQuery).not.toHaveBeenCalled();
    const [sharedSql, sharedParams] = mockRlsQuery.mock.calls[1]!;
    expect(sharedSql).toMatch(/p\.id = any\(\$3::uuid\[\]\)/i);
    expect(sharedSql).toMatch(/p\.organization_id is not distinct from \$4::uuid/i);
    expect((sharedParams as unknown[])[2]).toEqual([SHARED_PROJECT]);
  });

  it('404s for a project the organization does not share, even by exact uuid', async () => {
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: ORG,
      projectIds: [SHARED_PROJECT],
    });
    mockResolveActiveOrganizationId.mockResolvedValue(ORG);
    mockRlsQuery.mockResolvedValue([]);
    mockNeonQuery.mockResolvedValue([]);

    const response = await GET_PROJECT(detailRequest(FOREIGN_PROJECT), {
      params: Promise.resolve({ id: FOREIGN_PROJECT }),
    });

    expect(response.status).toBe(404);
    const [, sharedParams] = mockRlsQuery.mock.calls[1]!;
    expect((sharedParams as unknown[])[0]).toBe(FOREIGN_PROJECT);
    expect((sharedParams as unknown[])[2]).toEqual([SHARED_PROJECT]);
  });

  it('does not issue a shared read at all when the caller shares nothing', async () => {
    mockRlsQuery.mockResolvedValue([]);

    await GET_PROJECT(detailRequest(FOREIGN_PROJECT), {
      params: Promise.resolve({ id: FOREIGN_PROJECT }),
    }).catch(() => undefined);

    expect(mockRlsQuery).toHaveBeenCalledTimes(1);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
