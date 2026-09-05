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

// The badge needs the mode a task was STARTED in. `cloud_agent_runs` already
// records it per turn, so the list derives it there instead of adding a column
// that every existing conversation would be missing.
describe('GET /api/chat/conversations work mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('derives the mode from the conversation earliest agent run', async () => {
    await GET(new NextRequest('https://agiworkforce.com/api/chat/conversations'));

    const [sql] = mocks.query.mock.calls[0]! as [string];
    expect(sql).toContain('from cloud_agent_runs r');
    expect(sql).toContain('r.conversation_id = web_conversations.id');
    expect(sql).toContain('order by r.created_at asc');
    expect(sql).toContain('as work_mode');
  });

  it('returns the derived mode on the row the sidebar reads', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Pricing research',
        model: null,
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        work_mode: 'agiwork',
        created_at: '2026-09-05T00:00:00.000Z',
        updated_at: '2026-09-05T00:00:00.000Z',
      },
    ]);

    const response = await GET(new NextRequest('https://agiworkforce.com/api/chat/conversations'));
    const body = (await response.json()) as { conversations: Array<{ work_mode?: string }> };

    expect(body.conversations[0]?.work_mode).toBe('agiwork');
  });
});
