import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  claimed: new Set<string>(),
  enabled: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('workflow/api', () => ({ start: mocks.start }));
vi.mock('@/lib/workflows/usage-reset-reminder-workflow', () => ({
  usageResetReminderWorkflow: vi.fn(),
}));
vi.mock('@/lib/workflows/usage-reset-reminder-preference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workflows/usage-reset-reminder-preference')>()),
  usageResetReminderEnabled: vi.fn(async () => mocks.enabled),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cors')>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueStore: () => ({
    set: vi.fn(async (key: string, _value: unknown, options?: { onlyIfAbsent?: boolean }) => {
      if (options?.onlyIfAbsent && mocks.claimed.has(key)) return false;
      mocks.claimed.add(key);
      return true;
    }),
    delete: vi.fn(async (key: string) => (mocks.claimed.delete(key) ? 1 : 0)),
  }),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
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
});
