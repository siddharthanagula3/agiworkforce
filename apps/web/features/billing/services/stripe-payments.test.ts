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

import { upgradePlanMidCycle, upgradeToBasicPlan, upgradeToMax15xPlan } from './stripe-payments';

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

  it('completes required card authentication before reporting an upgrade as pending activation', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        paymentActionRequired: true,
        clientSecret: 'pi_upgrade_secret',
      }),
    } as Response);

    await expect(upgradePlanMidCycle({ plan: 'max' })).resolves.toEqual({
      activation: 'webhook_pending',
    });
    expect(stripeJsMocks.loadStripe).toHaveBeenCalledWith('pk_test_example');
    expect(stripeJsMocks.confirmPayment).toHaveBeenCalledWith({
      clientSecret: 'pi_upgrade_secret',
      redirect: 'if_required',
    });
  });
});
