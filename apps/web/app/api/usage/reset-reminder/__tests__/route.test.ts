import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type UsageResetReminderPreferenceModule =
  typeof import('@/lib/workflows/usage-reset-reminder-preference');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CorsModule = typeof import('@/lib/cors');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type KeyValueModule = typeof import('@/lib/server/key-value');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  claimed: new Map<string, unknown>(),
  enabled: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('workflow/api', () => ({ start: mocks.start }));
vi.mock('@/lib/workflows/usage-reset-reminder-workflow', () => ({
  usageResetReminderWorkflow: vi.fn(),
}));
vi.mock('@/lib/workflows/usage-reset-reminder-preference', async (importOriginal) => ({
  ...(await importOriginal<UsageResetReminderPreferenceModule>()),
  usageResetReminderEnabled: vi.fn(async () => mocks.enabled),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: () => ({
    get: vi.fn(async (key: string) => mocks.claimed.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, options?: { onlyIfAbsent?: boolean }) => {
      if (options?.onlyIfAbsent && mocks.claimed.has(key)) return false;
      mocks.claimed.set(key, value);
      return true;
    }),
    delete: vi.fn(async (key: string) => (mocks.claimed.delete(key) ? 1 : 0)),
  }),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { POST } = await import('../route');

function post(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/usage/reset-reminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

beforeEach(() => {
  mocks.start.mockReset();
  mocks.start.mockResolvedValue({ runId: 'run-1' });
  mocks.claimed.clear();
  mocks.enabled = true;
});

describe('POST /api/usage/reset-reminder', () => {
  it('refuses and schedules nothing when usage notifications are off', async () => {
    mocks.enabled = false;

    const response = await POST(post({ resetAt: inHours(3) }));

    expect(response.status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('schedules one reminder for the reset time and returns it', async () => {
    const resetAt = inHours(3);

    const response = await POST(post({ resetAt }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ remindAt: resetAt });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start.mock.calls[0]![1]).toEqual([{ userId: 'user-1', resetAt }]);
  });

  it('does not schedule a second push when the same reset is asked for twice', async () => {
    const resetAt = inHours(3);

    await POST(post({ resetAt }));
    const second = await POST(post({ resetAt }));

    expect(second.status).toBe(200);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('refuses a reset that has passed or lies beyond the longest usage window', async () => {
    expect((await POST(post({ resetAt: inHours(-1) }))).status).toBe(400);
    expect((await POST(post({ resetAt: inHours(24 * 9) }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('says the reminder was not set and lets a retry schedule it when the queue is down', async () => {
    const resetAt = inHours(3);
    mocks.start.mockRejectedValueOnce(new Error('queue unavailable'));

    const failed = await POST(post({ resetAt }));
    const retried = await POST(post({ resetAt }));

    expect(failed.status).toBe(503);
    expect(retried.status).toBe(200);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('does not confirm a second request while the first is still scheduling, nor after it fails', async () => {
    const resetAt = inHours(3);
    let rejectStart: (error: Error) => void = () => undefined;
    mocks.start.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStart = reject;
        }),
    );

    const first = POST(post({ resetAt }));
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const whilePending = await POST(post({ resetAt }));
    rejectStart(new Error('queue unavailable'));
    const firstResponse = await first;

    expect(whilePending.status).toBe(409);
    expect(firstResponse.status).toBe(503);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('confirms a second request once the first has scheduled the reminder', async () => {
    const resetAt = inHours(3);
    let resolveStart: (value: { runId: string }) => void = () => undefined;
    mocks.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    const first = POST(post({ resetAt }));
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    resolveStart({ runId: 'run-1' });
    expect((await first).status).toBe(200);

    const second = await POST(post({ resetAt }));

    expect(second.status).toBe(200);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
