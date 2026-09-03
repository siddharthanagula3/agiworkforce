import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockQuery, mockExecute, mockCsrf } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));

import { POST } from '../route';
import { PUT, DELETE } from '../[name]/route';
import { USER_SKILL_AUTHORING_ENV_VAR } from '@/lib/services/user-skill-authoring';

const DRAFT = {
  name: 'release-notes',
  description: 'Draft release notes from a diff.',
  body: 'Summarize the diff into a changelog entry.',
};

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/skills', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function putReq(name: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/skills/${name}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteReq(name: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/skills/${name}`, { method: 'DELETE' });
}

describe('/api/skills create, edit, delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env[USER_SKILL_AUTHORING_ENV_VAR] = '1';
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery, execute: mockExecute },
      userId: 'user-owner',
    });
    mockCsrf.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(1);
  });

  it('POST creates a skill through the RLS-scoped adapter', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 'skill-1',
        name: DRAFT.name,
        description: DRAFT.description,
        body: DRAFT.body,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
    ]);
    const res = await POST(postReq(DRAFT));
    expect(res.status).toBe(201);
    expect(mockGetUserScopedDb).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into user_skills');
    expect(params).toEqual(['user-owner', DRAFT.name, DRAFT.description, DRAFT.body]);
    const body = (await res.json()) as { skill: { name: string; editable: boolean } };
    expect(body.skill).toEqual({
      name: DRAFT.name,
      description: DRAFT.description,
      source: 'personal',
      lifecycle: 'included',
      downloadable: false,
      editable: true,
    });
  });

  it('POST checks CSRF before touching the database', async () => {
    mockCsrf.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const res = await POST(postReq(DRAFT));
    expect(res.status).toBe(403);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
  });

  it('POST rejects a name already used by a built-in skill', async () => {
    const res = await POST(postReq({ ...DRAFT, name: 'code-review' }));
    expect(res.status).toBe(409);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST rejects an invalid draft with a validation error', async () => {
    const res = await POST(postReq({ ...DRAFT, name: 'Not Valid' }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PUT updates a skill scoped to the current name and owner', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 'skill-1',
        name: DRAFT.name,
        description: DRAFT.description,
        body: DRAFT.body,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const res = await PUT(putReq('old-name', DRAFT), {
      params: Promise.resolve({ name: 'old-name' }),
    });
    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-owner', 'old-name', DRAFT.name, DRAFT.description, DRAFT.body]);
  });

  it('PUT returns 404 for a skill this user does not own', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await PUT(putReq('missing', DRAFT), {
      params: Promise.resolve({ name: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE removes a skill scoped to the owning user', async () => {
    mockExecute.mockResolvedValueOnce(1);
    const res = await DELETE(deleteReq(DRAFT.name), {
      params: Promise.resolve({ name: DRAFT.name }),
    });
    expect(res.status).toBe(204);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('delete from user_skills');
    expect(params).toEqual(['user-owner', DRAFT.name]);
  });

  it('DELETE returns 404 when nothing was removed', async () => {
    mockExecute.mockResolvedValueOnce(0);
    const res = await DELETE(deleteReq('missing'), {
      params: Promise.resolve({ name: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE checks CSRF before touching the database', async () => {
    mockCsrf.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const res = await DELETE(deleteReq(DRAFT.name), {
      params: Promise.resolve({ name: DRAFT.name }),
    });
    expect(res.status).toBe(403);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
  });
});

describe('/api/skills create, edit, delete when authoring is disabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[USER_SKILL_AUTHORING_ENV_VAR];
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery, execute: mockExecute },
      userId: 'user-owner',
    });
    mockCsrf.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(1);
  });

  it('POST answers 404 without touching the database', async () => {
    const res = await POST(postReq(DRAFT));
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PUT answers 404 without touching the database', async () => {
    const res = await PUT(putReq('old-name', DRAFT), {
      params: Promise.resolve({ name: 'old-name' }),
    });
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('DELETE answers 404 without touching the database', async () => {
    const res = await DELETE(deleteReq(DRAFT.name), {
      params: Promise.resolve({ name: DRAFT.name }),
    });
    expect(res.status).toBe(404);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
