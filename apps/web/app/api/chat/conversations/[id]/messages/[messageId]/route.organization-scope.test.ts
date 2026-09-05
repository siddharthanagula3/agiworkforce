import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
  resolveOrganizationMembershipId: vi.fn(),
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

const { PATCH, DELETE } = await import('./route');
const context = {
  params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }),
};

describe('message operations require an active-workspace parent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    '%s rejects a conversation outside the active organization',
    async (method, route) => {
      const request = new NextRequest(
        `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
        {
          method,
          ...(method === 'PATCH' ? { body: JSON.stringify({ reaction: 'thumbsUp' }) } : {}),
        },
      );

      const response = await route(request, context);

      expect(response.status).toBe(404);
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
        [CONVERSATION_ID, 'user-1', ORGANIZATION_ID],
      );
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
});
