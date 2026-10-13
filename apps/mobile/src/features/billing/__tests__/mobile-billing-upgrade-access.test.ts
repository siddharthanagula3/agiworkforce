const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { Platform } from 'react-native';
import {
  billingWaitlistSource,
  joinBillingUpgradeWaitlist,
  redeemBillingUpgradeCode,
} from '@/src/features/billing/mobileIapService';

describe('mobile billing upgrade access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ token: 'csrf-token' });
  });

  it('redeems a code through the same authenticated endpoint as web', async () => {
    mockPost.mockResolvedValue({ ok: true, accessGranted: true });

    await redeemBillingUpgradeCode('  agi2026  ');

    expect(mockPost).toHaveBeenCalledWith(
      '/api/waitlist/access',
      { code: 'AGI2026' },
      { headers: { 'x-csrf-token': 'csrf-token' } },
    );
  });

  it('refuses an unconfirmed redemption', async () => {
    mockPost.mockResolvedValue({ ok: true, accessGranted: false });

    await expect(redeemBillingUpgradeCode('AGI2026')).rejects.toThrow(
      'Upgrade access was not confirmed',
    );
  });

  it.each([
    ['ios', 'mobile-ios-billing'],
    ['android', 'mobile-android-billing'],
  ] as const)(
    'joins the selected plan waitlist from %s with a source that names the platform',
    async (os, source) => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
      mockPost.mockResolvedValue({ ok: true, joined: true });

      await joinBillingUpgradeWaitlist('max_15x');

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        '/api/waitlist',
        { plan: 'max_15x', billingInterval: 'monthly', source },
        { headers: { 'x-csrf-token': 'csrf-token' } },
      );
    },
  );

  it('keeps a distinct source for a surface that is neither store', () => {
    expect(billingWaitlistSource(null)).toBe('mobile-billing');
  });
});
