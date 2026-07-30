import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireUser: vi.fn(async (..._args: unknown[]) => 'user-1'),
  killSession: vi.fn(async (..._args: unknown[]) => undefined),
  scope: vi.fn((userId: string, conversationId: string) => ({ userId, conversationId })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: (...args: unknown[]) => mocks.requireUser(...args),
  getNeonChatDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/e2b/runtime', () => ({
  killE2BSession: (...args: unknown[]) => mocks.killSession(...args),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudE2BSessionScope: (userId: string, conversationId: string) =>
    mocks.scope(userId, conversationId),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { POST } = await import('./route');

function post(action: string) {
  return POST(
    new NextRequest('https://agiworkforce.com/api/chat/conversations/bulk', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  );
}

describe('POST /api/chat/conversations/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue('user-1');
  });

  it('archives only the authenticated owners live, unarchived conversations', async () => {
    mocks.query.mockResolvedValue([{ id: 'conversation-1' }, { id: 'conversation-2' }]);

    const response = await post('archive_all');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, action: 'archive_all', affectedCount: 2 });
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('where user_id = $1');
    expect(sql).toContain('deleted_at is null');
    expect(sql).toContain('archived = false');
    expect(params).toEqual(['user-1']);
    expect(mocks.killSession).not.toHaveBeenCalled();
  });

  it('deletes only archived conversations and releases each owned sandbox', async () => {
    mocks.query.mockResolvedValue([{ id: 'archived-1' }, { id: 'archived-2' }]);

    const response = await post('delete_archived');

    expect(response.status).toBe(200);
    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('where user_id = $1');
    expect(sql).toContain('archived = true');
    expect(mocks.scope).toHaveBeenCalledWith('user-1', 'archived-1');
    expect(mocks.scope).toHaveBeenCalledWith('user-1', 'archived-2');
    expect(mocks.killSession).toHaveBeenCalledTimes(2);
  });

  it('deletes active and archived conversations without an archived predicate', async () => {
    mocks.query.mockResolvedValue([]);

    await post('delete_all');

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('set deleted_at = now()');
    expect(sql).not.toContain('archived = true');
  });
});
