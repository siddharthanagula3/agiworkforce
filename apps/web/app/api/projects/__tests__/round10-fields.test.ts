import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ManagedCloudProjectResponseSchema } from '@agiworkforce/cloud-contracts';

const {
  mockFrom,
  mockUpdate,
  mockInsert,
  mockEq,
  mockSelect,
  mockSingle,
  mockGetClerkAuthUser,
  mockNeonQuery,
  mockNeonExecute,
  mockGetSubscription,
  mockResolveActiveOrganizationId,
} = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockUpdate = vi.fn();
  const mockInsert = vi.fn();
  const mockFrom = vi.fn();
  const mockGetClerkAuthUser = vi.fn();
  const mockNeonQuery = vi.fn();
  const mockNeonExecute = vi.fn();
  const mockGetSubscription = vi.fn();
  const mockResolveActiveOrganizationId = vi.fn();
  return {
    mockFrom,
    mockUpdate,
    mockInsert,
    mockEq,
    mockSelect,
    mockSingle,
    mockGetClerkAuthUser,
    mockNeonQuery,
    mockNeonExecute,
    mockGetSubscription,
    mockResolveActiveOrganizationId,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => {
    const adapter = {
      query: (...args: unknown[]) => mockNeonQuery(...args),
      execute: (...args: unknown[]) => mockNeonExecute(...args),
      transaction: vi.fn(),
      withUser: vi.fn(() => ({})),
      dispose: vi.fn(),
    };
    adapter.transaction.mockImplementation((fn: (db: typeof adapter) => unknown) => fn(adapter));
    return adapter;
  }),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => {
    const { userId } = await mockGetClerkAuthUser();
    const organizationId = await mockResolveActiveOrganizationId();
    const adapter = {
      query: (...args: unknown[]) => mockNeonQuery(...args),
      execute: (...args: unknown[]) => mockNeonExecute(...args),
      transaction: vi.fn(),
      withUser: vi.fn(() => ({})),
      dispose: vi.fn(),
    };
    adapter.transaction.mockImplementation((fn: (db: typeof adapter) => unknown) => fn(adapter));
    return { db: adapter, userId, organizationId };
  }),
}));

vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
  resolveOrganizationMembershipId: vi.fn(),
}));

import { DELETE, GET, PUT } from '@/app/api/projects/[id]/route';
import { GET as GET_PROJECTS, POST } from '@/app/api/projects/route';

const BASE_DB_ROW = {
  id: 'proj-1',
  user_id: 'user-abc',
  name: 'My Project',
  description: 'desc',
  instructions: null,
  color: '#3b82f6',
  is_archived: false,
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

const PROJECT_DEFAULT_MODEL_FIXTURE = 'test-project-default-model';

function makePutRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeProjectRequest(id: string, method: 'GET' | 'DELETE'): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}`, { method });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeListProjectsRequest(): NextRequest {
  return new NextRequest('http://localhost/api/projects?limit=50&offset=0');
}

function wireAuthAndDb() {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockNeonExecute.mockResolvedValue(1);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'free' });
  mockResolveActiveOrganizationId.mockResolvedValue(null);
}

function setupUpdateChain(resolvedValue: { data: unknown; error: unknown }) {
  if (resolvedValue.error) {
    mockNeonQuery.mockRejectedValue(resolvedValue.error);
  } else {
    mockNeonQuery.mockResolvedValue(resolvedValue.data ? [resolvedValue.data] : []);
  }
  mockSingle.mockResolvedValue(resolvedValue);
  mockSelect.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ eq: mockEq, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq });
}

function setupInsertChain(resolvedValue: { data: unknown; error: unknown }) {
  if (resolvedValue.error) {
    mockNeonQuery.mockRejectedValue(resolvedValue.error);
  } else {
    mockNeonQuery.mockResolvedValue(resolvedValue.data ? [resolvedValue.data] : []);
  }
  mockSingle.mockResolvedValue(resolvedValue);
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ insert: mockInsert });
}

describe('GET /api/projects · conversation counts', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('returns the canonical count of live conversations for each project', async () => {
    mockNeonQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('organization_members')
        ? []
        : [{ ...BASE_DB_ROW, conversation_count: 2 }],
    );

    const res = await GET_PROJECTS(makeListProjectsRequest());
    const json = (await res.json()) as { projects: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    expect(json.projects[0]?.['conversationCount']).toBe(2);
    const projectSql = mockNeonQuery.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('from user_projects'));
    expect(projectSql).toContain('conversation_count');
    expect(projectSql).toContain('c.organization_id is not distinct from $5::uuid');
  });
});

describe('PUT /api/projects/[id] · round-10 fields', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('round-trips iconEmoji and accentColor through PUT → mapper output', async () => {
    const dbRow = { ...BASE_DB_ROW, icon_emoji: '🚀', accent_color: 'sky' };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', { iconEmoji: '🚀', accentColor: 'sky' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: Record<string, unknown> };
    expect(ManagedCloudProjectResponseSchema.safeParse(json).success).toBe(true);
    expect(json.project['iconEmoji']).toBe('🚀');
    expect(json.project['accentColor']).toBe('sky');
  });

  it('persists starred into the existing metadata jsonb (no schema migration)', async () => {
    const dbRow = { ...BASE_DB_ROW, metadata: { starred: true } };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', { starred: true });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    const sqlCalls = mockNeonQuery.mock.calls.map((c) => String(c[0]));
    expect(
      sqlCalls.some((sql) => /metadata = coalesce\(metadata/.test(sql) && /starred/.test(sql)),
    ).toBe(true);
    const json = (await res.json()) as { project: { metadata?: Record<string, unknown> } };
    expect(json.project.metadata?.['starred']).toBe(true);
  });

  it('updates only the owner row in the active organization workspace', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    mockResolveActiveOrganizationId.mockResolvedValue(organizationId);
    setupUpdateChain({ data: { ...BASE_DB_ROW, name: 'Scoped update' }, error: null });

    const res = await PUT(makePutRequest('proj-1', { name: 'Scoped update' }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });

    expect(res.status).toBe(200);
    const [sql, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/organization_id is not distinct from \$\d+::uuid/i);
    expect(params.at(-1)).toBe(organizationId);
  });

  it('round-trips defaultPrivacyMode, defaultProviderMode, allowedSurfaces, defaultModelId, importedFrom', async () => {
    const dbRow = {
      ...BASE_DB_ROW,
      default_privacy_mode: 'managed',
      default_provider_mode: 'ManagedNative',
      allowed_surfaces: ['web', 'mobile'],
      default_model_id: PROJECT_DEFAULT_MODEL_FIXTURE,
      imported_from: 'claude',
    };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', {
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedNative',
      allowedSurfaces: ['web', 'mobile'],
      defaultModelId: PROJECT_DEFAULT_MODEL_FIXTURE,
      importedFrom: 'claude',
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: Record<string, unknown> };
    expect(json.project['defaultPrivacyMode']).toBe('managed');
    expect(json.project['defaultProviderMode']).toBe('ManagedNative');
    expect(json.project['allowedSurfaces']).toEqual(['web', 'mobile']);
    expect(json.project['defaultModelId']).toBe(PROJECT_DEFAULT_MODEL_FIXTURE);
    expect(json.project['importedFrom']).toBe('claude');
  });

  it('returns 400 when accentColor is invalid enum value', async () => {
    const req = makePutRequest('proj-1', { accentColor: 'fuchsia' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/accentColor/i);
  });

  it('returns 400 when defaultPrivacyMode is invalid', async () => {
    const req = makePutRequest('proj-1', { defaultPrivacyMode: 'unknown-mode' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/defaultPrivacyMode/i);
  });

  it('rejects Local or BYOK defaults for a Managed Cloud project', async () => {
    const req = makePutRequest('proj-1', {
      defaultPrivacyMode: 'byok',
      defaultProviderMode: 'DirectByok',
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('returns 400 instead of crashing when color is null', async () => {
    const req = makePutRequest('proj-1', { color: null });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('does not update a soft-deleted project', async () => {
    mockNeonQuery.mockImplementation(async (sql: string) =>
      sql.includes('deleted_at is null') ? [] : [{ ...BASE_DB_ROW, deleted_at: new Date() }],
    );

    const req = makePutRequest('proj-1', { name: 'Must stay deleted' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(404);
    expect((mockNeonQuery.mock.calls[0] as [string])[0]).toContain('deleted_at is null');
  });

  it('rejects invalid allowedSurfaces entries instead of silently rewriting them', async () => {
    const req = makePutRequest('proj-1', {
      allowedSurfaces: ['web', 'invalid-surface', 'desktop'],
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('rejects local developer-session surfaces for a Managed Cloud project', async () => {
    const req = makePutRequest('proj-1', { allowedSurfaces: ['web', 'cli'] });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('partial PUT · only iconEmoji provided leaves other fields untouched', async () => {
    const dbRow = {
      ...BASE_DB_ROW,
      icon_emoji: '🌟',
      default_privacy_mode: 'local',
      default_provider_mode: 'Local',
    };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', { iconEmoji: '🌟' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    const callArgs = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    const sql = callArgs[0];
    expect(sql).toContain('icon_emoji');
    expect(sql).not.toContain('default_privacy_mode');
    expect(sql).not.toContain('default_provider_mode');
    expect(sql).not.toContain('accent_color');
  });

  it('retries without round-10 fields when DB returns 42703 undefined_column', async () => {
    const pgError = { code: '42703', message: 'column does not exist' };
    mockNeonQuery
      .mockRejectedValueOnce(pgError)
      .mockResolvedValueOnce([BASE_DB_ROW])
      .mockResolvedValueOnce([{ ...BASE_DB_ROW, conversation_count: 0 }]);

    const req = makePutRequest('proj-1', { iconEmoji: '🔥', name: 'Updated Name' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledTimes(3);
    const firstSql = (mockNeonQuery.mock.calls[0] as [string, unknown[]])[0];
    const secondSql = (mockNeonQuery.mock.calls[1] as [string, unknown[]])[0];
    expect(firstSql).toContain('icon_emoji');
    expect(secondSql).not.toContain('icon_emoji');
    expect(secondSql).toContain('name');
  });
});

describe('GET and DELETE /api/projects/[id] · tombstone safety', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('does not return a soft-deleted project by direct ID', async () => {
    mockNeonQuery.mockImplementation(async (sql: string) =>
      sql.includes('deleted_at is null') ? [] : [{ ...BASE_DB_ROW, deleted_at: new Date() }],
    );

    const res = await GET(makeProjectRequest('proj-1', 'GET'), {
      params: Promise.resolve({ id: 'proj-1' }),
    });

    expect(res.status).toBe(404);
    expect((mockNeonQuery.mock.calls[0] as [string])[0]).toContain('deleted_at is null');
  });

  it('returns not found when delete matched no live project', async () => {
    mockNeonExecute.mockResolvedValue(0);

    const res = await DELETE(makeProjectRequest('missing', 'DELETE'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('soft-deletes only the owner row in the active organization workspace', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    mockResolveActiveOrganizationId.mockResolvedValue(organizationId);
    mockNeonExecute.mockResolvedValue(1);
    mockNeonQuery.mockResolvedValue([]);

    const res = await DELETE(makeProjectRequest('proj-1', 'DELETE'), {
      params: Promise.resolve({ id: 'proj-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockNeonExecute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['proj-1', 'user-abc', organizationId],
    );
    expect(mockNeonExecute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['proj-1', 'user-abc', organizationId],
    );
  });
});

describe('POST /api/projects · round-10 fields', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('POST accepts round-10 fields and maps them in the response', async () => {
    const dbRow = {
      ...BASE_DB_ROW,
      id: 'proj-new',
      name: 'New Project',
      icon_emoji: '📁',
      accent_color: 'amber',
      default_privacy_mode: 'managed',
      default_provider_mode: 'ManagedGateway',
      allowed_surfaces: ['web', 'desktop', 'mobile'],
      imported_from: 'openai',
    };
    setupInsertChain({ data: dbRow, error: null });

    const req = makePostRequest({
      name: 'New Project',
      iconEmoji: '📁',
      accentColor: 'amber',
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedGateway',
      allowedSurfaces: ['web', 'desktop', 'mobile'],
      importedFrom: 'openai',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = (await res.json()) as { project: Record<string, unknown> };
    expect(ManagedCloudProjectResponseSchema.safeParse(json).success).toBe(true);
    expect(json.project['iconEmoji']).toBe('📁');
    expect(json.project['accentColor']).toBe('amber');
    expect(json.project['defaultPrivacyMode']).toBe('managed');
    expect(json.project['defaultProviderMode']).toBe('ManagedGateway');
    expect(json.project['allowedSurfaces']).toEqual(['web', 'desktop', 'mobile']);
    expect(json.project['importedFrom']).toBe('openai');

    const [sql, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("assert_user_resource_limit('projects'");
    expect(params).toContain(1);
  });

  it.each([
    ['Personal', null],
    ['organization', '11111111-1111-4111-8111-111111111111'],
  ] as const)('binds a new project to the active %s workspace', async (_label, organizationId) => {
    mockResolveActiveOrganizationId.mockResolvedValue(organizationId);
    setupInsertChain({ data: { ...BASE_DB_ROW, id: 'proj-scoped' }, error: null });

    const res = await POST(makePostRequest({ name: 'Scoped project' }));

    expect(res.status).toBe(201);
    const [sql, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into user_projects \(user_id, organization_id,/i);
    expect(params[0]).toBe('user-abc');
    expect(params[1]).toBe(organizationId);
  });

  it('creates the project and complete conversation membership through one transaction', async () => {
    mockNeonQuery
      .mockResolvedValueOnce([{ ...BASE_DB_ROW, id: 'proj-new', name: 'New Project' }])
      .mockResolvedValueOnce([{ id: 'chat-1' }, { id: 'chat-2' }]);

    const res = await POST(
      makePostRequest({
        name: 'New Project',
        conversationIds: ['chat-1', 'chat-2', 'chat-1'],
      }),
    );

    expect(res.status).toBe(201);
    expect(mockNeonExecute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('set project_id = null'),
      ['user-abc', 'proj-new', ['chat-1', 'chat-2'], null],
    );
    expect(mockNeonExecute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('set project_id = $2'),
      ['user-abc', 'proj-new', ['chat-1', 'chat-2'], null],
    );
  });

  it('uses the Pro project limit from the shared billing catalog', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro' });
    setupInsertChain({ data: { ...BASE_DB_ROW, id: 'proj-paid' }, error: null });

    const res = await POST(makePostRequest({ name: 'Paid project' }));

    expect(res.status).toBe(201);
    const [sql, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("assert_user_resource_limit('projects'");
    expect(params).toContain(25);
  });

  it('keeps Max project creation unlimited', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'max' });
    setupInsertChain({ data: { ...BASE_DB_ROW, id: 'proj-max' }, error: null });

    const res = await POST(makePostRequest({ name: 'Max project' }));

    expect(res.status).toBe(201);
    const [, params] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(null);
  });

  it('fails closed for a missing subscription before inserting', async () => {
    mockGetSubscription.mockResolvedValue(null);

    const res = await POST(makePostRequest({ name: 'Blocked project' }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
    expect((await res.json()).error.message).toBe(
      'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.',
    );
  });

  it('POST returns 400 for invalid importedFrom enum', async () => {
    const req = makePostRequest({ name: 'Test', importedFrom: 'github' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/importedFrom/i);
  });

  it.each([
    { name: 'Test', description: 42 },
    { name: 'Test', instructions: { text: 'unsafe' } },
    { name: 'Test', allowedSurfaces: null },
    { name: 'Test', color: 7 },
  ])('POST rejects malformed field types without reaching the database: %j', async (body) => {
    const res = await POST(makePostRequest(body));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
