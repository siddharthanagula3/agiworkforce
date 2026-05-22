/**
 * Tests for round-10 field wiring in /api/projects (POST) and
 * /api/projects/[id] (PUT).
 *
 * Covers: each new field round-trips, invalid enum returns 400,
 * invalid allowedSurfaces entry is filtered, partial PUT leaves other
 * fields untouched, POST accepts round-10 fields, mapper output matches
 * PUT response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mocks (vi.hoisted runs before all imports/mocks) ─────────────────

const {
  mockFrom,
  mockUpdate,
  mockInsert,
  mockEq,
  mockSelect,
  mockSingle,
  mockGetAuthenticatedUserWithClient,
} = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockUpdate = vi.fn();
  const mockInsert = vi.fn();
  const mockFrom = vi.fn();
  const mockGetAuthenticatedUserWithClient = vi.fn();
  return {
    mockFrom,
    mockUpdate,
    mockInsert,
    mockEq,
    mockSelect,
    mockSingle,
    mockGetAuthenticatedUserWithClient,
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
  getAuthenticatedUserWithClient: mockGetAuthenticatedUserWithClient,
  getAuthenticatedUser: vi.fn(),
}));

// ── Route imports (after mocks) ───────────────────────────────────────────────

import { PUT } from '@/app/api/projects/[id]/route';
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

function makePutRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Wire auth mock to a fresh supabase builder each test.
// vitest.config.ts sets mockReset: true so we must re-register implementations
// in every beforeEach rather than relying on module-level defaults.
function wireAuthAndDb() {
  mockGetAuthenticatedUserWithClient.mockResolvedValue({
    user: { id: 'user-abc' },
    userDb: { from: (...args: unknown[]) => mockFrom(...args) },
  });
}

// Set up supabase builder chain: from().update()/insert().eq().select().single()
function setupUpdateChain(resolvedValue: { data: unknown; error: unknown }) {
  mockSingle.mockResolvedValue(resolvedValue);
  mockSelect.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ eq: mockEq, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq });
}

function setupInsertChain(resolvedValue: { data: unknown; error: unknown }) {
  mockSingle.mockResolvedValue(resolvedValue);
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ insert: mockInsert });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PUT /api/projects/[id] — round-10 fields', () => {
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
    expect(json.project['iconEmoji']).toBe('🚀');
    expect(json.project['accentColor']).toBe('sky');
  });

  it('round-trips defaultPrivacyMode, defaultProviderMode, allowedSurfaces, defaultModelId, importedFrom', async () => {
    const dbRow = {
      ...BASE_DB_ROW,
      default_privacy_mode: 'byok',
      default_provider_mode: 'DirectByok',
      allowed_surfaces: ['web', 'mobile'],
      default_model_id: 'claude-opus-4-7',
      imported_from: 'claude',
    };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', {
      defaultPrivacyMode: 'byok',
      defaultProviderMode: 'DirectByok',
      allowedSurfaces: ['web', 'mobile'],
      defaultModelId: 'claude-opus-4-7',
      importedFrom: 'claude',
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: Record<string, unknown> };
    expect(json.project['defaultPrivacyMode']).toBe('byok');
    expect(json.project['defaultProviderMode']).toBe('DirectByok');
    expect(json.project['allowedSurfaces']).toEqual(['web', 'mobile']);
    expect(json.project['defaultModelId']).toBe('claude-opus-4-7');
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

  it('filters invalid allowedSurfaces entries and keeps valid ones', async () => {
    const dbRow = { ...BASE_DB_ROW, allowed_surfaces: ['web', 'desktop'] };
    setupUpdateChain({ data: dbRow, error: null });

    const req = makePutRequest('proj-1', {
      allowedSurfaces: ['web', 'invalid-surface', 'desktop'],
    });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    // Verify the update payload was called with only the valid surfaces
    const updatePayload = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload['allowed_surfaces']).toEqual(['web', 'desktop']);
  });

  it('partial PUT — only iconEmoji provided leaves other fields untouched', async () => {
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
    // Only updated_at and icon_emoji should be in the update payload
    const updatePayload = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(updatePayload)).toContain('icon_emoji');
    expect(Object.keys(updatePayload)).not.toContain('default_privacy_mode');
    expect(Object.keys(updatePayload)).not.toContain('default_provider_mode');
    expect(Object.keys(updatePayload)).not.toContain('accent_color');
  });

  it('retries without round-10 fields when DB returns 42703 undefined_column', async () => {
    const pgError = { code: '42703', message: 'column does not exist' };
    // First call (with round-10 fields) returns PG error; second (legacy only) succeeds
    mockSingle
      .mockResolvedValueOnce({ data: null, error: pgError })
      .mockResolvedValueOnce({ data: BASE_DB_ROW, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ eq: mockEq, select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq });

    const req = makePutRequest('proj-1', { iconEmoji: '🔥', name: 'Updated Name' });
    const res = await PUT(req, { params: Promise.resolve({ id: 'proj-1' }) });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const firstPayload = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    const secondPayload = mockUpdate.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(firstPayload).toHaveProperty('icon_emoji');
    expect(secondPayload).not.toHaveProperty('icon_emoji');
    expect(secondPayload).toHaveProperty('name', 'Updated Name');
  });
});

describe('POST /api/projects — round-10 fields', () => {
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
      default_privacy_mode: 'byok',
      default_provider_mode: 'DirectByok',
      allowed_surfaces: ['web', 'desktop', 'mobile'],
      imported_from: 'openai',
    };
    setupInsertChain({ data: dbRow, error: null });

    const req = makePostRequest({
      name: 'New Project',
      iconEmoji: '📁',
      accentColor: 'amber',
      defaultPrivacyMode: 'byok',
      defaultProviderMode: 'DirectByok',
      allowedSurfaces: ['web', 'desktop', 'mobile'],
      importedFrom: 'openai',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = (await res.json()) as { project: Record<string, unknown> };
    expect(json.project['iconEmoji']).toBe('📁');
    expect(json.project['accentColor']).toBe('amber');
    expect(json.project['defaultPrivacyMode']).toBe('byok');
    expect(json.project['defaultProviderMode']).toBe('DirectByok');
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
});
