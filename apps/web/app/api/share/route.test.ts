/**
 * GET /api/share — the caller's own share links.
 *
 * The endpoint did not exist: a user could create a share and revoke one whose
 * URL they still had, but had no way to see what they had published. Any
 * "Shared links" screen therefore had nothing to call, which is why the mobile
 * one shipped as a placeholder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  authUser: vi.fn(async () => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET } = await import('./route');

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok-1',
    title: 'Planning session',
    model_id: 'model-a',
    provider: 'anthropic',
    total_messages: 12,
    expires_at: FUTURE,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const call = () => GET(new NextRequest('https://agiworkforce.com/api/share'));

describe('GET /api/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('returns the callers own shares with a usable URL', async () => {
    mocks.query.mockResolvedValue([row()]);

    const body = await (await call()).json();

    expect(body.shares).toHaveLength(1);
    expect(body.shares[0]).toMatchObject({
      token: 'tok-1',
      title: 'Planning session',
      messageCount: 12,
      expired: false,
    });
    expect(body.shares[0].shareUrl).toContain('/share/tok-1');
  });

  it('scopes the query to the authenticated owner', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql, params] = mocks.query.mock.calls[0]!;
    // owner_id is the access control here, matching the DELETE path.
    expect(sql).toContain('owner_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('never returns the conversation bodies', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql] = mocks.query.mock.calls[0]!;
    // This is an index; selecting `messages` would return every shared
    // conversation body in one response.
    expect(sql).not.toMatch(/\bmessages\b/);
  });

  it('marks expired shares instead of hiding them', async () => {
    mocks.query.mockResolvedValue([row({ token: 'old', expires_at: PAST })]);

    const body = await (await call()).json();

    // A user must be able to see and revoke a link that has lapsed; filtering
    // it out leaves them unable to clean up a URL still referenced elsewhere.
    expect(body.shares).toHaveLength(1);
    expect(body.shares[0].expired).toBe(true);
  });

  it('falls back to a title when the row has none', async () => {
    mocks.query.mockResolvedValue([row({ title: null })]);
    const body = await (await call()).json();
    expect(body.shares[0].title).toBe('Shared Session');
  });

  it('returns an empty list rather than failing when nothing is shared', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).shares).toEqual([]);
  });
});
