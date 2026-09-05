import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  killE2BSession: vi.fn(),
  unpublishForConversations: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/services/published-artifact-service', () => ({
  unpublishArtifactsForConversations: (...args: unknown[]) =>
    mocks.unpublishForConversations(...args),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  killE2BSession: (...args: unknown[]) => mocks.killE2BSession(...args),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudE2BSessionScope: (userId: string, conversationId: string) => ({
    tenantId: 'managed-cloud',
    userId,
    conversationId,
  }),
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  deleteE2BSession: vi.fn(),
  getE2BSession: vi.fn(),
  saveE2BSession: vi.fn(),
  withUserSandboxLock: vi.fn(async (_scope: unknown, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { DELETE } = await import('./route');
const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function request(): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`, {
    method: 'DELETE',
  });
}

describe('DELETE /api/chat/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.killE2BSession.mockResolvedValue(undefined);
    mocks.unpublishForConversations.mockResolvedValue([]);
  });

  it('returns 404 and keeps cleanup untouched when no live owned row was deleted', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.killE2BSession).not.toHaveBeenCalled();
    expect(mocks.unpublishForConversations).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/deleted_at is null[\s\S]*returning id/u),
      [CONVERSATION_ID, 'user-1', null],
    );
  });

  it('reports success only after the scoped update returns the deleted row', async () => {
    mocks.query.mockResolvedValue([{ id: CONVERSATION_ID }]);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.killE2BSession).toHaveBeenCalledOnce();
  });

  it('revokes every artifact published out of the conversation being deleted', async () => {
    mocks.query.mockResolvedValue([{ id: CONVERSATION_ID }]);
    mocks.unpublishForConversations.mockResolvedValue(['tokenaaaaaaaaaaaaaaaaaaa']);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.unpublishForConversations).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      conversationIds: [CONVERSATION_ID],
    });
  });

  it('fails the delete rather than leaving a public artifact serving a deleted chat', async () => {
    mocks.query.mockResolvedValue([{ id: CONVERSATION_ID }]);
    mocks.unpublishForConversations.mockRejectedValue(new Error('db down'));

    const response = await DELETE(request(), context);

    expect(response.status).toBe(500);
    expect(mocks.killE2BSession).not.toHaveBeenCalled();
  });
});
