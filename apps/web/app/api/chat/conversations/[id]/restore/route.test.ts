import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Restoring a soft-deleted conversation. The interesting cases are the ones
 * that must NOT succeed: restoring someone else's conversation, and restoring
 * one that was never deleted (which would otherwise report success for a no-op
 * and let the UI claim it put something back).
 */

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireUser: vi.fn(async (..._args: unknown[]) => 'user-1'),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: (...args: unknown[]) => mocks.requireUser(...args),
  getNeonChatDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { POST } = await import('./route');

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

const restoredRow = {
  id: CONVERSATION_ID,
  title: 'Recovered plan',
  model: null,
  project_id: null,
  pinned: false,
  starred: false,
  archived: true,
  is_temporary: false,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  deleted_at: null,
};

function request() {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/restore`,
    { method: 'POST' },
  );
}

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

describe('POST /api/chat/conversations/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([restoredRow]);
  });

  it('clears deleted_at for the owner', async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('set deleted_at = null');
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('deleted_at is not null');
    expect(params).toEqual([CONVERSATION_ID, 'user-1']);
  });

  it('returns the restored conversation so the caller can put it back in the sidebar', async () => {
    const response = await POST(request(), context);
    const body = (await response.json()) as { conversation: { id: string; archived: boolean } };

    expect(body.conversation.id).toBe(CONVERSATION_ID);
    // Restoring preserves the previous archived state rather than dumping the
    // conversation into the main list.
    expect(body.conversation.archived).toBe(true);
  });

  it('does not bump updated_at', async () => {
    await POST(request(), context);

    const [sql] = mocks.query.mock.calls[0]!;
    // `updated_at` orders the sidebar; touching it would jump an old restored
    // conversation to the top as if it had new activity.
    expect(sql).not.toContain('updated_at = now()');
  });

  it('404s when nothing was restored', async () => {
    // Covers both "not yours" and "was not deleted" — the statement is
    // conditional on both, and the response must not distinguish them.
    mocks.query.mockResolvedValue([]);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
  });

  it('rejects a request that fails CSRF', async () => {
    const { requireCsrfToken } = await import('@/lib/csrf');
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(
      new Response('forbidden', { status: 403 }) as never,
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
