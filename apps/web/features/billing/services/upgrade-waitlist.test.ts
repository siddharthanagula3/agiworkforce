import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'token',
  })),
}));

import {
  joinUpgradeWaitlist,
  readUpgradeWaitlistStatus,
  redeemUpgradeAccessCode,
  upgradeNeedsWaitlist,
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

  it('stops waiting for a join the server does not answer and says so', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'));

    await expect(joinUpgradeWaitlist({ plan: 'pro', billingInterval: 'monthly' })).rejects.toThrow(
      'The server took too long to answer. Try again.',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
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

  it('reads the joined plans and the access this account holds from the server', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        joinedPlans: ['basic', 'enterprise'],
        upgradeGateEnabled: true,
        accessGranted: false,
      }),
    } as Response);

    await expect(readUpgradeWaitlistStatus()).resolves.toEqual({
      joinedPlans: ['basic'],
      upgradeGateEnabled: true,
      accessGranted: false,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/waitlist', { cache: 'no-store' });
  });

  it('refuses a status it cannot read instead of guessing at access', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ upgradeGateEnabled: false }),
    } as Response);

    await expect(readUpgradeWaitlistStatus()).rejects.toThrow(
      'Upgrade access could not be checked.',
    );
  });

  it('sends a gated account without access to the waitlist, and everyone else to checkout', () => {
    expect(
      upgradeNeedsWaitlist({ joinedPlans: [], upgradeGateEnabled: true, accessGranted: false }),
    ).toBe(true);
    expect(
      upgradeNeedsWaitlist({ joinedPlans: [], upgradeGateEnabled: true, accessGranted: true }),
    ).toBe(false);
    expect(
      upgradeNeedsWaitlist({ joinedPlans: [], upgradeGateEnabled: false, accessGranted: true }),
    ).toBe(false);
  });

  it('keeps the gate when access cannot be verified', () => {
    expect(upgradeNeedsWaitlist(null)).toBe(true);
  });
});
