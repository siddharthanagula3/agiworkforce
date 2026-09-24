import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })) }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/e2b/runtime', () => ({ killE2BSession: vi.fn() }));

const mockQuery = vi.fn();
const mockGetUserScopedDb = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

import { PUT } from '@/app/api/chat/conversations/[id]/route';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function putRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/chat/conversations/${CONVERSATION_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: vi.fn(), transaction: vi.fn() },
    userId: 'user-123',
    organizationId: null,
  });
  mockQuery.mockResolvedValue([{ id: CONVERSATION_ID }]);
});

describe('PUT /api/chat/conversations/[id] · composer draft', () => {
  it('stores the draft without touching what orders the sidebar or guards edits', async () => {
    const response = await PUT(putRequest({ draft: 'half a thought' }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, draftUpdatedAt: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/set draft =/);
    expect(sql).not.toMatch(/updated_at = now\(\)/);
    expect(sql).not.toMatch(/server_version/);
    expect(params[2]).toBe('half a thought');
  });

  it('refuses to keep a temporary chat’s draft, in the statement rather than the caller', async () => {
    await PUT(putRequest({ draft: 'half a thought' }), context);

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toMatch(/case when is_temporary then null/);
  });

  it('clears the draft when the composer is emptied', async () => {
    await PUT(putRequest({ draft: '' }), context);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });

  it('404s a conversation the caller does not own', async () => {
    mockQuery.mockResolvedValue([]);

    const response = await PUT(putRequest({ draft: 'half a thought' }), context);

    expect(response.status).toBe(404);
  });

  it('refuses a draft past the cap rather than truncating it silently', async () => {
    const response = await PUT(putRequest({ draft: 'x'.repeat(20_001) }), context);

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('still applies a real edit sent alongside a draft', async () => {
    mockQuery.mockResolvedValueOnce([{ id: CONVERSATION_ID }]).mockResolvedValueOnce([
      {
        id: CONVERSATION_ID,
        organization_id: null,
        title: 'Renamed',
        model: 'auto',
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        active_leaf_message_id: null,
        created_at: '2026-01-25T00:00:00Z',
        updated_at: '2026-01-25T00:00:00Z',
        server_version: '2',
      },
    ]);

    const response = await PUT(putRequest({ draft: 'half a thought', title: 'Renamed' }), context);

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [updateSql] = mockQuery.mock.calls[1] as [string];
    expect(updateSql).toMatch(/update web_conversations/);
  });
});
