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

const { GET, POST } = await import('./route');

const url = (query = '') => `https://agiworkforce.com/api/chat/conversations${query}`;

describe('GET /api/chat/conversations deleted filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('excludes deleted conversations by default', async () => {
    await GET(new NextRequest(url()));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('deleted_at is null');
    expect(sql).not.toContain('deleted_at is not null');
  });

  it('returns only deleted conversations when asked', async () => {
    const response = await GET(new NextRequest(url('?deleted=only')));

    expect(response.status).toBe(200);
    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('deleted_at is not null');
  });

  it('stays owner-scoped in both modes', async () => {
    for (const query of ['', '?deleted=only']) {
      mocks.query.mockClear();
      await GET(new NextRequest(url(query)));
      const [sql, params] = mocks.query.mock.calls[0]!;
      expect(sql).toContain('user_id = $1');
      expect((params as unknown[])[0]).toBe('user-1');
    }
  });

  it('selects deleted_at so the list can show when it happened', async () => {
    await GET(new NextRequest(url('?deleted=only')));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('deleted_at');
  });

  it('rejects an unknown filter value rather than defaulting silently', async () => {
    const response = await GET(new NextRequest(url('?deleted=all')));

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('still applies the archived filter alongside it', async () => {
    await GET(new NextRequest(url('?deleted=only&archived=only')));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('deleted_at is not null');
    expect(sql).toContain('archived = true');
  });
});

describe('POST /api/chat/conversations deleted conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('rejects a tombstoned or unavailable id without resurrecting it', async () => {
    const response = await POST(
      new NextRequest(url(), {
        method: 'POST',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Stale mobile conversation',
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'conversation_unavailable' },
    });
    const sql = mocks.query.mock.calls
      .map(([statement]) => String(statement))
      .find((statement) => statement.includes('insert into web_conversations'));
    expect(sql).toContain('web_conversations.deleted_at is null');
    expect(sql).not.toContain('deleted_at = null');
  });
});
