import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Deleted conversations are SOFT-deleted (`deleted_at`) and nothing purges them
 * — there is no conversation equivalent of `cron/purge-deleted-media`. Before
 * the `deleted=only` filter they were simply unreachable: every read filtered
 * `deleted_at is null`, so a mis-click was permanent for the user while the
 * rows sat in the table indefinitely.
 *
 * The failure is silent and severe in both directions: a default that leaks
 * deleted conversations back into the sidebar, or an `only` filter that lists
 * live ones with a "Restore" button beside them.
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

const { GET } = await import('./route');

const url = (query = '') => `https://agiworkforce.com/api/chat/conversations${query}`;

describe('GET /api/chat/conversations deleted filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('excludes deleted conversations by default', async () => {
    await GET(new NextRequest(url()));

    const [sql] = mocks.query.mock.calls[0]!;
    // Every existing caller omits the parameter; none may start seeing deleted
    // conversations because this filter was added.
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
    // Falling back to the default here would make `?deleted=all` quietly return
    // live conversations to a caller that asked for something else.
    const response = await GET(new NextRequest(url('?deleted=all')));

    expect(response.status).toBe(400);
    // And it must not have run a query with a guessed filter.
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('still applies the archived filter alongside it', async () => {
    await GET(new NextRequest(url('?deleted=only&archived=only')));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('deleted_at is not null');
    expect(sql).toContain('archived = true');
  });
});
