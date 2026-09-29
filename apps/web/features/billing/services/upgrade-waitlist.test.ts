import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'token',
  })),
}));

import {
  isUpgradeWaitlistRequired,
  joinUpgradeWaitlist,
  redeemUpgradeAccessCode,
} from './upgrade-waitlist';

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

  it('opens checkout directly only when the server explicitly disables the gate', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ upgradeGateEnabled: false }),
    } as Response);

    await expect(isUpgradeWaitlistRequired()).resolves.toBe(false);
  });

  it('keeps the gate when its status cannot be verified', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Offline'));

    await expect(isUpgradeWaitlistRequired()).resolves.toBe(true);
  });
});
