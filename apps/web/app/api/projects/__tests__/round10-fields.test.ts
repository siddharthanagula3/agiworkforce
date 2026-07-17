/**
 * Tests for round-10 field wiring in /api/projects (POST) and
 * /api/projects/[id] (PUT).
 *
 * Covers: each new field round-trips, invalid enum returns 400,
 * invalid allowedSurfaces entries are rejected, partial PUT leaves other
 * fields untouched, POST accepts round-10 fields, mapper output matches
 * PUT response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ManagedCloudProjectResponseSchema } from '@agiworkforce/cloud-contracts';

// ── Hoisted mocks (vi.hoisted runs before all imports/mocks) ─────────────────

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
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// ── Route imports (after mocks) ───────────────────────────────────────────────

import { DELETE, GET, PUT } from '@/app/api/projects/[id]/route';
import { POST } from '@/app/api/projects/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Wire auth mock.
// vitest.config.ts sets mockReset: true so we must re-register implementations
// in every beforeEach rather than relying on module-level defaults.
function wireAuthAndDb() {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockNeonExecute.mockResolvedValue(1);
}

// Set up neon query chain: db.query() resolves with row array (update/select returning *)
function setupUpdateChain(resolvedValue: { data: unknown; error: unknown }) {
  // Route calls db.query(sql, params) and expects row array.
  // Simulate: first call (with round-10 fields) returns the updated row or PG error.
  if (resolvedValue.error) {
    mockNeonQuery.mockRejectedValue(resolvedValue.error);
  } else {
    mockNeonQuery.mockResolvedValue(resolvedValue.data ? [resolvedValue.data] : []);
  }
  // Keep cloud database builder chain wired for mockUpdate assertion in allowedSurfaces test
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

// ── Tests ─────────────────────────────────────────────────────────────────────

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
    // SQL should reference icon_emoji but NOT default_privacy_mode, default_provider_mode, accent_color
    const callArgs = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    const sql = callArgs[0];
    expect(sql).toContain('icon_emoji');
    expect(sql).not.toContain('default_privacy_mode');
    expect(sql).not.toContain('default_provider_mode');
    expect(sql).not.toContain('accent_color');
  });

  it('retries without round-10 fields when DB returns 42703 undefined_column', async () => {
    const pgError = { code: '42703', message: 'column does not exist' };
    // First call (with round-10 fields) rejects with PG error; second (legacy only) succeeds
    mockNeonQuery.mockRejectedValueOnce(pgError).mockResolvedValueOnce([BASE_DB_ROW]);

    const req = makePutRequest('proj-1', { iconEmoji: '🔥', name: 'Updated Name' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledTimes(2);
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
