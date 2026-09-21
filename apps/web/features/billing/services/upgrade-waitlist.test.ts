import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'token',
  })),
}));

import { joinUpgradeWaitlist, redeemUpgradeAccessCode } from './upgrade-waitlist';

describe('upgrade waitlist client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('records the selected paid plan without starting checkout', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

    await joinUpgradeWaitlist({ plan: 'max_15x', billingInterval: 'monthly' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/waitlist',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          plan: 'max_15x',
          billingInterval: 'monthly',
          source: 'billing-upgrade',
        }),
      }),
    );
  });

  it('redeems an access code through the authenticated billing gate', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

    await redeemUpgradeAccessCode('AGIWAITLIST2026');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/waitlist/access',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'AGIWAITLIST2026' }),
      }),
    );
  });

  it('surfaces the server message for a refused code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'This access code has expired.' } }),
    } as Response);

    await expect(redeemUpgradeAccessCode('EXPIREDCODE')).rejects.toThrow(
      'This access code has expired.',
    );
  });
});
