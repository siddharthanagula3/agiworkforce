import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestFetch: vi.fn(),
  requestAssertBoundary: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  refreshUserData: vi.fn(),
  getPlanTier: vi.fn(),
  openExternalUrl: vi.fn(),
  openDesktopBillingWindow: vi.fn(),
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    refreshUserData: mocks.refreshUserData,
    getPlanTier: mocks.getPlanTier,
  },
}));

vi.mock('../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
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

import {
  applyPlanUpgrade,
  openBillingPortal,
  openCheckout,
  previewPlanUpgrade,
  waitForPlanActivation,
} from '../stripeCheckout';
import { useAuthStore } from '../../stores/auth';

describe('Desktop Stripe upgrade flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createManagedCloudRequestContext.mockReturnValue({
      fetch: mocks.requestFetch,
      assertBoundary: mocks.requestAssertBoundary,
    });
    mocks.refreshUserData.mockResolvedValue(undefined);
    mocks.getPlanTier.mockReturnValue('max');
    useAuthStore.setState({
      subscriptionSource: 'stripe',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses the exact due-now and recurring amounts for full-price checkout', async () => {
    mocks.requestFetch.mockResolvedValue(
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
    mocks.requestFetch.mockResolvedValue(
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

  it('captures account authority before checkout and never opens a stale account response', async () => {
    let resolveCheckout!: (response: Response) => void;
    mocks.requestFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveCheckout = resolve;
      }),
    );
    let current = true;
    mocks.requestAssertBoundary.mockImplementation(() => {
      if (!current) throw new Error('The Managed Cloud account changed');
    });

    const checkout = openCheckout('pro');
    expect(mocks.createManagedCloudRequestContext).toHaveBeenCalledWith('Cloud checkout');
    await vi.waitFor(() => expect(mocks.requestFetch).toHaveBeenCalledOnce());
    current = false;
    resolveCheckout(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(checkout).resolves.toBe(
      'Unable to reach payment service. Check your internet connection.',
    );
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
    expect(mocks.openDesktopBillingWindow).not.toHaveBeenCalled();
  });

  it('does not send portal, checkout, or upgrade requests for an Apple-owned subscription', async () => {
    useAuthStore.setState({
      subscriptionSource: 'apple',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
    });

    await expect(openCheckout('pro')).resolves.toMatch(/managed by Apple/i);
    await expect(openBillingPortal()).resolves.toMatch(/managed by Apple/i);
    await expect(previewPlanUpgrade('pro')).rejects.toThrow(/managed by Apple/i);
    await expect(applyPlanUpgrade('pro', 'preview')).rejects.toThrow(/managed by Apple/i);
    expect(mocks.requestFetch).not.toHaveBeenCalled();
  });

  it('fails closed before a Stripe request when ownership is not verified', async () => {
    useAuthStore.setState({
      subscriptionSource: 'none',
      subscriptionStatus: 'none',
      subscriptionFetchStatus: 'failed',
    });

    await expect(openCheckout('pro')).resolves.toMatch(/could not be verified/i);
    expect(mocks.requestFetch).not.toHaveBeenCalled();
  });
});
