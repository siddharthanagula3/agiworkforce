import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeJsMocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  loadStripe: vi.fn(),
}));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn(async (headers) => headers) }));
vi.mock('@stripe/stripe-js/pure', () => ({
  loadStripe: (...args: unknown[]) => stripeJsMocks.loadStripe(...args),
}));

import { finishBrowserHandoff } from '@/features/desktop-host/lib/browser-handoff';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import {
  UpgradeAccessRequiredError,
  fetchSavedPaymentMethods,
  openBillingPortal,
  previewUpgrade,
  startPlanCheckout,
  startTopUpCheckout,
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

  it('reports a failed payment method read instead of answering that none is on file', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Billing is temporarily unavailable.' } }),
    } as Response);

    await expect(fetchSavedPaymentMethods()).rejects.toThrow('Billing is temporarily unavailable.');
  });

  it('still answers an empty list when the account really has no payment method', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ payment_methods: [] }),
    } as Response);

    await expect(fetchSavedPaymentMethods()).resolves.toEqual([]);
  });

  it('starts Max 20x checkout with the canonical tier id', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/max-15x' }),
    } as Response);

    await upgradeToMax15xPlan();

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      plan: 'max_15x',
      billingInterval: 'monthly',
    });
  });

  it('names a checkout refused for missing upgrade access, so the caller can offer the waitlist', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 'waitlist_access_required',
          message:
            'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.',
        },
      }),
    } as Response);

    const refusal = upgradeToBasicPlan();

    await expect(refusal).rejects.toBeInstanceOf(UpgradeAccessRequiredError);
    await expect(refusal).rejects.toThrow('Paid upgrades are opening in stages.');
  });

  it('keeps any other checkout refusal a plain error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'forbidden', message: 'Checkout is not allowed.' } }),
    } as Response);

    const refusal = upgradeToBasicPlan();

    await expect(refusal).rejects.toThrow('Checkout is not allowed.');
    await expect(refusal).rejects.not.toBeInstanceOf(UpgradeAccessRequiredError);
  });

  it('sends a fresh checkout idempotency key with every plan checkout', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/max-15x' }),
    } as Response);

    await upgradeToMax15xPlan();
    await upgradeToMax15xPlan();

    const keys = fetchMock.mock.calls.map(
      (call) => (call[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(fetchMock.mock.calls.every((call) => call[0] === '/api/checkout')).toBe(true);
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(key).toMatch(/^agi\.checkout\.web\.[0-9a-f-]{36}$/);
    expect(new Set(keys).size).toBe(2);
  });

  it('never lets the browser choose the charged currency', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/basic' }),
    } as Response);

    await upgradeToBasicPlan();

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

    // charge is null when the server sends no breakdown, so the dialog falls
    // back to stating the total on its own rather than rendering an empty receipt.
    await expect(previewUpgrade({ plan: 'max_15x' })).resolves.toEqual({
      amountDueNowCents: 10_042,
      currency: 'usd',
      previewToken: 'signed-preview-token',
      charge: null,
      promotion: null,
      replacesScheduledChange: false,
      grandfatheredNotice: null,
    });
  });

  it('sends a promotion code with the preview and returns the discount the server applied', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        amountDueNowCents: 1_500,
        currency: 'usd',
        previewToken: 'signed-preview-token',
        promotion: { code: 'SPRING', percentOff: 25, duration: 'once' },
        replacesScheduledChange: true,
      }),
    } as Response);

    const result = await previewUpgrade({ plan: 'pro', promotionCode: 'SPRING' });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      plan: 'pro',
      promotionCode: 'SPRING',
    });
    expect(result.promotion).toEqual({
      code: 'SPRING',
      percentOff: 25,
      amountOffCents: null,
      currency: null,
      duration: 'once',
      durationInMonths: null,
    });
    expect(result.replacesScheduledChange).toBe(true);
  });

  it('passes through the itemized charge so the dialog can show a receipt', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        amountDueNowCents: 11_819,
        currency: 'usd',
        previewToken: 'signed-preview-token',
        charge: {
          lineItems: [
            { description: 'Max plan - 20x', amountCents: 20_000 },
            { description: 'Unused time on Max plan - 5x', amountCents: -8_913 },
          ],
          subtotalCents: 11_087,
          taxCents: 732,
          totalDueTodayCents: 11_819,
          renewsAt: '2026-03-26T00:00:00.000Z',
        },
      }),
    } as Response);

    const result = await previewUpgrade({ plan: 'max_15x' });
    expect(result.charge?.totalDueTodayCents).toBe(11_819);
    expect(result.charge?.lineItems).toHaveLength(2);
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

  it('says the page went to checkout when it runs in a browser', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/pro' }),
    } as Response);

    await expect(startPlanCheckout({ plan: 'pro' })).resolves.toBe('navigated');
  });

  describe('in the desktop shell', () => {
    const openExternal = vi.fn(async () => undefined);

    beforeEach(() => {
      openExternal.mockClear();
      window.agiHost = hostBridgeStub({ openExternal });
    });

    afterEach(() => {
      finishBrowserHandoff();
      delete window.agiHost;
    });

    it('opens checkout in the browser on purpose and leaves this page where it is', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://checkout.example/pro' }),
      } as Response);

      await expect(startPlanCheckout({ plan: 'pro' })).resolves.toBe('handed-off');

      expect(openExternal).toHaveBeenCalledWith('https://checkout.example/pro');
      expect(window.location.href).toBe('');
    });

    it('sends the portal and a top-up to the browser the same way', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://billing.example/session' }),
      } as Response);

      await expect(openBillingPortal()).resolves.toBe('handed-off');
      await expect(startTopUpCheckout(10)).resolves.toBe('handed-off');

      expect(openExternal).toHaveBeenCalledTimes(2);
      expect(window.location.href).toBe('');
    });
  });

  it('starts a top-up checkout with only the selected whole-dollar amount', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/top-up' }),
    } as Response);

    await startTopUpCheckout(20);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/top-up',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ amountUsd: 20 });
    expect(window.location.href).toBe('https://checkout.example/top-up');
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
    // A card that demands a full redirect rather than an inline challenge gets
    // handed to the issuer's page, and Stripe refuses to confirm without
    // somewhere to come back to. /pricing is where the upgrade started and it
    // re-reads the plan on focus.
    expect(stripeJsMocks.confirmPayment).toHaveBeenCalledWith({
      clientSecret: 'pi_upgrade_secret',
      confirmParams: { return_url: `${window.location.origin}/pricing` },
      redirect: 'if_required',
    });
  });
});
