const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import {
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

  it('joins the selected plan waitlist without starting a purchase', async () => {
    mockPost.mockResolvedValue({ ok: true, joined: true });

    await joinBillingUpgradeWaitlist('max_15x');

    expect(mockPost).toHaveBeenCalledWith(
      '/api/waitlist',
      { plan: 'max_15x', billingInterval: 'monthly', source: 'mobile-billing' },
      { headers: { 'x-csrf-token': 'csrf-token' } },
    );
  });
});
