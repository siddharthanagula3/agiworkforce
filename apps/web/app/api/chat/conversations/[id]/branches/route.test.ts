import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listGroups: vi.fn(),
  forkConversation: vi.fn(),
  requireCsrf: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/services/conversation-branch-service', () => ({
  listConversationBranchGroups: (...args: unknown[]) => mocks.listGroups(...args),
  forkConversation: (...args: unknown[]) => mocks.forkConversation(...args),
}));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrf(...args),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET, POST } = await import('./route');

const conversationId = '0190a000-0000-7000-8000-0000000000aa';
const messageId = '0190a000-0000-7000-8000-0000000000bb';
const requestId = '0190a000-0000-7000-8000-0000000000cc';
const context = { params: Promise.resolve({ id: conversationId }) };

function request(method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${conversationId}/branches`,
    {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

describe('/api/chat/conversations/[id]/branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1' });
    mocks.requireCsrf.mockResolvedValue(null);
    mocks.listGroups.mockResolvedValue([]);
  });

  it('lists only the groups returned by the owner-scoped service', async () => {
    const response = await GET(request('GET'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ groups: [] });
    expect(mocks.getUserScopedDb).toHaveBeenCalledOnce();
    expect(mocks.listGroups).toHaveBeenCalledWith({}, 'user-1', conversationId);
  });

  it('validates the idempotent fork request and returns the created conversation', async () => {
    mocks.forkConversation.mockResolvedValue({
      id: requestId,
      title: 'Source chat (branch)',
      model: 'auto',
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: new Date('2026-07-30T00:00:00.000Z'),
      updated_at: new Date('2026-07-30T00:00:00.000Z'),
    });

    const response = await POST(request('POST', { messageId, requestId }), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.conversation.id).toBe(requestId);
    expect(body.conversation.created_at).toBe('2026-07-30T00:00:00.000Z');
    expect(mocks.forkConversation).toHaveBeenCalledWith({}, 'user-1', {
      sourceConversationId: conversationId,
      messageId,
      requestId,
    });
  });

  it('rejects malformed ids before opening the database', async () => {
    const response = await POST(request('POST', { messageId: 'not-a-uuid', requestId }), context);

    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.forkConversation).not.toHaveBeenCalled();
  });

  it('honors a CSRF rejection before any branch mutation', async () => {
    mocks.requireCsrf.mockResolvedValue(
      NextResponse.json({ error: { message: 'Invalid CSRF token' } }, { status: 403 }),
    );

    const response = await POST(request('POST', { messageId, requestId }), context);

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.forkConversation).not.toHaveBeenCalled();
  });
});
