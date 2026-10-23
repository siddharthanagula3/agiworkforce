import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type RlsDbModule = typeof import('@/lib/server/rls-db');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type CorsModule = typeof import('@/lib/cors');

type ScanModule0 = typeof import('@/lib/services/tier-unit-quota-service');

const WINDOW = '2026-10-02T08:00:00.000Z/2026-10-02T09:00:00.000Z';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  assertFreeDailyAllowance: vi.fn(async (_input: unknown) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertFreeDailyAllowance: mocks.assertFreeDailyAllowance,
}));

const { POST } = await import('./route');

function create(): Promise<Response> {
  return POST(
    new NextRequest('https://agiworkforce.com/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New conversation' }),
    }),
  );
}

function insertsIssued(): number {
  return mocks.query.mock.calls.filter(([sql]) =>
    String(sql).includes('insert into web_conversations'),
  ).length;
}

describe('creating a conversation during planned maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.stubEnv('AGI_MAINTENANCE_WINDOW', WINDOW);
    mocks.query.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('refuses a new conversation while the window is under way and says until when', async () => {
    vi.setSystemTime(new Date('2026-10-02T08:30:00.000Z'));

    const response = await create();

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe(
      'New chats are paused for planned maintenance until Oct 2, 2026, 9:00 AM UTC. Try again after it ends.',
    );
    expect(insertsIssued()).toBe(0);
  });

  it.each([
    ['before the window starts', '2026-10-02T07:59:59.000Z'],
    ['once the window has ended', '2026-10-02T09:00:00.000Z'],
  ])('creates the conversation %s', async (_when, at) => {
    vi.setSystemTime(new Date(at));

    const response = await create();

    expect(response.status).not.toBe(503);
    expect(insertsIssued()).toBe(1);
  });

  it('creates the conversation when no window is set', async () => {
    vi.stubEnv('AGI_MAINTENANCE_WINDOW', '');
    vi.setSystemTime(new Date('2026-10-02T08:30:00.000Z'));

    await create();

    expect(insertsIssued()).toBe(1);
  });
});
