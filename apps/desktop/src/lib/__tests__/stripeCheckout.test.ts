import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getValidSession: vi.fn(),
  refreshUserData: vi.fn(),
  getPlanTier: vi.fn(),
  openExternalUrl: vi.fn(),
  openDesktopBillingWindow: vi.fn(),
}));

vi.mock('../../api/cloudApi', () => ({
  cloudFetch: mocks.cloudFetch,
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    getValidSession: mocks.getValidSession,
    refreshUserData: mocks.refreshUserData,
    getPlanTier: mocks.getPlanTier,
  },
}));

vi.mock('../../utils/navigation', () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

vi.mock('../../services/desktopBillingWindow', () => ({
  openDesktopBillingWindow: mocks.openDesktopBillingWindow,
}));

vi.mock('../../services/managedCloudBoundary', () => ({
  captureManagedCloudBoundary: () => ({
    accountId: 'user-desktop',
    accessToken: 'desktop-token',
  }),
  assertManagedCloudBoundary: vi.fn(),
}));

vi.mock('../runtimeEnvironment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtimeEnvironment')>()),
  isTauri: false,
}));

import { applyPlanUpgrade, previewPlanUpgrade, waitForPlanActivation } from '../stripeCheckout';

describe('Desktop Stripe upgrade flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getValidSession.mockResolvedValue({ access_token: 'desktop-token' });
    mocks.refreshUserData.mockResolvedValue(undefined);
    mocks.getPlanTier.mockReturnValue('max');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses the exact due-now and recurring amounts for full-price checkout', async () => {
    mocks.cloudFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'checkout_required',
            message: 'Starting this plan requires checkout.',
          },
          checkout: {
            amountDueNowCents: 20_000,
            recurringAmountCents: 20_000,
            currency: 'usd',
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(previewPlanUpgrade('max_15x')).resolves.toEqual({
      kind: 'checkout-required',
      amountDueNowCents: 20_000,
      recurringAmountCents: 20_000,
      currency: 'usd',
      message: 'Starting this plan requires checkout.',
    });
  });

  it('returns Stripe hosted authentication instead of reporting a failed upgrade', async () => {
    mocks.cloudFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          paymentActionRequired: true,
          paymentUrl: 'https://invoice.stripe.com/i/acct_test/inv_test',
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(applyPlanUpgrade('max_15x', 'signed-preview')).resolves.toEqual({
      kind: 'payment-action-required',
      paymentUrl: 'https://invoice.stripe.com/i/acct_test/inv_test',
    });
  });

  it('waits for the canonical account webhook projection before reporting activation', async () => {
    vi.useFakeTimers();
    mocks.refreshUserData.mockImplementation(async () => {
      if (mocks.refreshUserData.mock.calls.length >= 3) {
        mocks.getPlanTier.mockReturnValue('max_15x');
      }
    });

    const activation = waitForPlanActivation('max_15x');
    await vi.runAllTimersAsync();

    await expect(activation).resolves.toBe(true);
    expect(mocks.refreshUserData).toHaveBeenCalledTimes(3);
  });
});
