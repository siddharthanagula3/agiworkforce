import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
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
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET } = await import('./route');

const url = (query = '') => `https://agiworkforce.com/api/chat/conversations${query}`;

describe('GET /api/chat/conversations empty conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('lists only conversations that hold at least one message', async () => {
    await GET(new NextRequest(url()));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain(
      'exists (select 1 from web_messages where web_messages.conversation_id = web_conversations.id)',
    );
  });

  it('keeps the predicate in the deleted view and inside a project', async () => {
    for (const query of ['?deleted=only', '?projectId=00000000-0000-4000-8000-000000000001']) {
      mocks.query.mockClear();
      await GET(new NextRequest(url(query)));
      const [sql] = mocks.query.mock.calls[0]!;
      expect(sql).toContain('exists (select 1 from web_messages');
    }
  });
});
