// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('answers 500 when the shared state cannot be read, so the next run tries again', async () => {
    mocks.remind.mockRejectedValue(new Error('store unreachable'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
