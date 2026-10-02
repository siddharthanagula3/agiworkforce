// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/cron-auth');
type ScanModule1 = typeof import('@/lib/server/free-quota-renewal');

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  remind: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  verifyCronRequest: mocks.verify,
}));
vi.mock('@/lib/server/free-quota-renewal', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  remindFreeQuotaRenewals: mocks.remind,
}));

const { GET } = await import('./route');

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/cron/remind-free-quota-renewal');
}

beforeEach(() => {
  mocks.verify.mockReturnValue(true);
  mocks.remind.mockResolvedValue({ checked: true, reminders: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('free quota renewal cron', () => {
  it('turns away a caller without the cron secret and checks nothing', async () => {
    mocks.verify.mockReturnValue(false);

    expect((await GET(request())).status).toBe(401);
    expect(mocks.remind).not.toHaveBeenCalled();
  });

  it('runs the check at the server clock and reports what it sent', async () => {
    const before = Date.now();
    mocks.remind.mockResolvedValue({
      checked: true,
      reminders: [{ reason: 'console_check_expiring', outcome: 'sent' }],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checked: true,
      reminders: [{ reason: 'console_check_expiring', outcome: 'sent' }],
    });
    expect(mocks.remind.mock.calls[0]![0]).toBeGreaterThanOrEqual(before);
  });

  it('answers 500 when a reminder reached nobody, so the failed run shows in the cron log', async () => {
    const run = {
      checked: true,
      reminders: [
        { reason: 'terms_review_expiring', outcome: 'sent' },
        { reason: 'console_check_expired', outcome: 'undelivered' },
      ],
    };
    mocks.remind.mockResolvedValue(run);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(run);
  });

  it.each([[['credential']], [['shared_state']], [['shared_state', 'credential']]])(
    'answers 500 in production when the inventory lists free models but %j is missing, so a removed key is not silent',
    async (missing) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      const run = { checked: false, missing };
      mocks.remind.mockResolvedValue(run);

      const response = await GET(request());

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual(run);
    },
  );

  it.each([[['inventory']], [['credential', 'inventory']]])(
    'answers 200 in production when the code carries no free quota inventory (%j), since free models are then off on purpose',
    async (missing) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      const run = { checked: false, missing };
      mocks.remind.mockResolvedValue(run);

      const response = await GET(request());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(run);
    },
  );

  it('answers 200 outside production when free models are not set up', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const run = { checked: false, missing: ['shared_state', 'credential'] };
    mocks.remind.mockResolvedValue(run);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(run);
  });

  it('answers 500 when the shared state cannot be read, so the next run tries again', async () => {
    mocks.remind.mockRejectedValue(new Error('store unreachable'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
