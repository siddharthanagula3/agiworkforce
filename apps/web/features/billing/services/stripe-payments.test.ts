import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeJsMocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  loadStripe: vi.fn(),
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn(async (headers) => headers) }));
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => stripeJsMocks.loadStripe(...args),
}));

import {
  previewUpgrade,
  startPlanCheckout,
  upgradePlanMidCycle,
  upgradeToBasicPlan,
  upgradeToMax15xPlan,
} from './stripe-payments';

describe('stripe payments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stripeJsMocks.confirmPayment.mockReset();
    stripeJsMocks.loadStripe.mockReset();
    stripeJsMocks.loadStripe.mockResolvedValue({
      confirmPayment: stripeJsMocks.confirmPayment,
    });
    stripeJsMocks.confirmPayment.mockResolvedValue({
      paymentIntent: { status: 'succeeded' },
    });
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] = 'pk_test_example';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  it('starts Max 15x checkout with the canonical tier id', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/max-15x' }),
    } as Response);

    await upgradeToMax15xPlan({ userId: 'user_1', userEmail: 'user@example.com' });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      plan: 'max_15x',
      billingInterval: 'monthly',
    });
  });

  it('never lets the browser choose the charged currency', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/basic' }),
    } as Response);

    await upgradeToBasicPlan({ userId: 'user_1', userEmail: 'user@example.com' });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      plan: 'basic',
      billingInterval: 'monthly',
    });
  });

  it('returns the server-signed preview token with the displayed prorated amount', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        amountDueNowCents: 10_042,
        currency: 'usd',
        previewToken: 'signed-preview-token',
      }),
    } as Response);

    await expect(previewUpgrade({ plan: 'max_15x' })).resolves.toEqual({
      amountDueNowCents: 10_042,
      currency: 'usd',
      previewToken: 'signed-preview-token',
    });
  });

  it('surfaces a typed checkout fallback when the stored subscription is stale', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'checkout_required',
          message: 'Start a new checkout to continue.',
        },
        checkout: {
          amountDueNowCents: 20_000,
          currency: 'usd',
        },
      }),
    } as Response);

    await expect(previewUpgrade({ plan: 'max_15x' })).rejects.toMatchObject({
      name: 'CheckoutRequiredError',
      amountDueNowCents: 20_000,
      currency: 'usd',
    });
  });

  it('starts the requested checkout fallback without browser-supplied identity data', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/max-15x' }),
    } as Response);

    await startPlanCheckout({ plan: 'max_15x', billingInterval: 'monthly' });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      plan: 'max_15x',
      billingInterval: 'monthly',
    });
    expect(window.location.href).toBe('https://checkout.example/max-15x');
  });

  it('completes required card authentication before reporting an upgrade as pending activation', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        paymentActionRequired: true,
        clientSecret: 'pi_upgrade_secret',
      }),
    } as Response);

    await expect(
      upgradePlanMidCycle({ plan: 'max', previewToken: 'signed-preview-token' }),
    ).resolves.toEqual({
      activation: 'webhook_pending',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      previewToken: 'signed-preview-token',
    });
    expect(stripeJsMocks.loadStripe).toHaveBeenCalledWith('pk_test_example');
    expect(stripeJsMocks.confirmPayment).toHaveBeenCalledWith({
      clientSecret: 'pi_upgrade_secret',
      redirect: 'if_required',
    });
  });
});
