import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enableWebPush: vi.fn() }));

vi.mock('@/features/notifications', () => ({ enableWebPush: mocks.enableWebPush }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

const { requestUsageResetReminder } = await import('../usage-reset-reminder');

const RESET_AT = '2026-10-20T12:00:00.000Z';

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.enableWebPush.mockReset();
});

describe('requestUsageResetReminder', () => {
  it('schedules the reminder once this browser can be notified', async () => {
    mocks.enableWebPush.mockResolvedValue('enabled');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestUsageResetReminder(RESET_AT)).resolves.toBe('set');

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/usage/reset-reminder');
    expect(JSON.parse(String(init.body))).toEqual({ resetAt: RESET_AT });
  });

  it('schedules nothing that could never arrive when notifications are blocked', async () => {
    mocks.enableWebPush.mockResolvedValue('denied');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestUsageResetReminder(RESET_AT)).resolves.toBe('blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refused request instead of claiming the reminder is set', async () => {
    mocks.enableWebPush.mockResolvedValue('enabled');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );

    await expect(requestUsageResetReminder(RESET_AT)).resolves.toBe('failed');
  });
});
