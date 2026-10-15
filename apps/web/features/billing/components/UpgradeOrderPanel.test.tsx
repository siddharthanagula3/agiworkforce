import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
type ScanModule0 = typeof import('../services/stripe-payments');

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  startPlanCheckout: vi.fn(),
  fetchSavedPaymentMethods: vi.fn(),
  openBillingPortal: vi.fn(async () => {}),
}));

const waitlistState = vi.hoisted(() => ({
  status: null as null | {
    joinedPlans: string[];
    upgradeGateEnabled: boolean;
    accessGranted: boolean;
  },
  checking: false,
}));

vi.mock('../hooks/use-upgrade-waitlist', () => ({
  resolveUpgradeWaitlistStatus: vi.fn(),
  useUpgradeWaitlistStatus: () => ({
    status: waitlistState.status,
    checking: waitlistState.checking,
    recordJoined: vi.fn(),
    recordAccessGranted: vi.fn(),
  }),
}));

vi.mock('./UpgradeWaitlistDialog', () => ({
  UpgradeWaitlistDialog: () => null,
  UpgradeWaitlistPanel: ({
    request,
    onAccessGranted,
  }: {
    request: { plan: string; billingInterval: string };
    onAccessGranted: (request: { plan: string; billingInterval: string }) => Promise<void>;
  }) => (
    <section aria-label={`${request.plan} upgrade waitlist`}>
      <button type="button" onClick={() => void onAccessGranted(request)}>
        Redeem code
      </button>
    </section>
  ),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ initialized: true, isAuthenticated: true, user: { id: 'user-1' } }),
}));

vi.mock('../services/stripe-payments', async () => {
  const actual = await vi.importActual<ScanModule0>('../services/stripe-payments');
  return { ...actual, ...paymentMocks };
});

vi.mock('@shared/components/ServiceNotices', () => ({
  ServiceNotices: ({ scope }: { scope: string }) => (
    <div data-testid="service-notices" data-scope={scope} />
  ),
}));

import * as actualErrors from '../services/stripe-payments';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { UpgradeOrderPanel } from './UpgradeOrderPanel';

const PRO_SUBSCRIBER: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
  subscription_source: 'stripe',
};

const FREE_ACCOUNT: SubscriptionPlan = {
  tier: 'free',
  display_name: 'Free',
  status: 'none',
  current_period_end: null,
  plan_name: 'Free',
};

function holdAccount(subscription: SubscriptionPlan) {
  useBillingStore.setState({
    subscription,
    initialized: true,
    isLoading: false,
    error: null,
    unauthenticated: false,
  });
}

function servePlanPrices(basicMonthly: { amountMinor: number; currency: string }) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    if (!String(input).includes('/api/pricing/localized')) {
      return new Promise<Response>(() => undefined);
    }
    return {
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: basicMonthly.currency,
        plans: {
          basic: { monthly: { ...basicMonthly, localized: true, checkoutReady: true } },
          pro: {},
          max: {},
          max_15x: {},
          team: {},
        },
      }),
    } as Response;
  });
}

const PRORATED_PREVIEW = {
  amountDueNowCents: 8_596,
  currency: 'usd',
  previewToken: 'signed-preview-token',
  charge: {
    lineItems: [
      { description: 'Unused time on Pro', amountCents: -1_404 },
      { description: 'Remaining time on Max', amountCents: 10_000 },
    ],
    subtotalCents: 8_596,
    discountCents: 0,
    taxCents: 660,
    totalCents: 9_256,
    appliedBalanceCents: 0,
    totalDueTodayCents: 9_256,
    renewsAt: '2026-09-17T12:00:00.000Z',
  },
  promotion: null,
  replacesScheduledChange: false,
};

function renderPanel() {
  render(<UpgradeOrderPanel plan="max" returnPath="/upgrade/max" />);
}

describe('UpgradeOrderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitlistState.status = null;
    waitlistState.checking = false;
    holdAccount(PRO_SUBSCRIBER);
    paymentMocks.previewUpgrade.mockResolvedValue(PRORATED_PREVIEW);
    paymentMocks.upgradePlanMidCycle.mockResolvedValue({ activation: 'webhook_pending' });
    paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([
      {
        id: 'pm_1',
        type: 'card',
        isDefault: true,
        card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2030 },
      },
    ]);
  });

  it('will not charge until the recurring terms are actually agreed to', async () => {
    renderPanel();

    const subscribe = await screen.findByRole('button', { name: /subscribe to/i });
    await waitFor(() => expect(screen.getByText('$92.56')).toBeVisible());

    // The amount being right is not consent. Until the box is ticked there must
    // be no way to start a recurring charge from this screen.
    expect(subscribe).toBeDisabled();
    fireEvent.click(subscribe);
    expect(paymentMocks.upgradePlanMidCycle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(subscribe).toBeEnabled());
    fireEvent.click(subscribe);

    await waitFor(() =>
      expect(paymentMocks.upgradePlanMidCycle).toHaveBeenCalledWith({
        plan: 'max',
        billingInterval: 'monthly',
        previewToken: 'signed-preview-token',
      }),
    );
  });

  it('carries billing service notices above the order, where a billing outage is scoped', async () => {
    renderPanel();

    expect(await screen.findByTestId('service-notices')).toHaveAttribute('data-scope', 'billing');
  });

  it('names the payment method that will be charged rather than "your saved card"', async () => {
    renderPanel();

    expect(await screen.findByText('Visa ending in 4242')).toBeVisible();
  });

  it('labels a Link method honestly instead of inventing a card', async () => {
    // Checkout with Link stores a `link` method with no card object. Claiming a
    // card here would name something that does not exist on the account.
    paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([
      { id: 'pm_link', type: 'link', isDefault: true, card: null },
    ]);
    renderPanel();

    expect(await screen.findByText('Link by Stripe')).toBeVisible();
  });

  it('offers to add a method when the account has none, instead of implying one', async () => {
    paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText('No payment method on file')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  it('says the payment method could not be read instead of claiming none is on file', async () => {
    paymentMocks.fetchSavedPaymentMethods.mockRejectedValue(
      new Error('We could not load your payment method.'),
    );
    renderPanel();

    const payment = await screen.findByRole('region', { name: 'Payment method' });
    expect(await within(payment).findByRole('alert')).toHaveTextContent(
      'We could not load your payment method.',
    );
    expect(screen.queryByText('No payment method on file')).toBeNull();
    expect(within(payment).getByRole('button', { name: 'Change' })).toBeVisible();
  });

  it('holds the order summary busy while it is priced, then releases it to be announced', async () => {
    let resolvePreview: (value: typeof PRORATED_PREVIEW) => void = () => {};
    paymentMocks.previewUpgrade.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    renderPanel();

    const order = screen.getByRole('region', { name: 'Order details' });
    expect(order).toHaveAttribute('aria-live', 'polite');
    expect(order).toHaveAttribute('aria-busy', 'true');
    expect(order).toHaveTextContent('Calculating your prorated cost');

    resolvePreview(PRORATED_PREVIEW);

    await waitFor(() => expect(order).toHaveAttribute('aria-busy', 'false'));
    expect(order).toHaveTextContent('$92.56');
  });

  it('pairs every figure in the order with the label that says what it is', async () => {
    renderPanel();
    const order = await screen.findByRole('region', { name: 'Order details' });
    await waitFor(() => expect(order).toHaveAttribute('aria-busy', 'false'));

    const terms = within(order).getAllByRole('term');
    const definitions = within(order).getAllByRole('definition');
    expect(terms.map((term) => term.textContent)).toEqual([
      'Unused time on Pro',
      'Remaining time on Max',
      'Subtotal',
      'Tax',
      'Total due today',
    ]);
    expect(definitions).toHaveLength(terms.length);
    expect(definitions.at(-1)).toHaveTextContent('$92.56');
  });

  it('prices a promotion code before charging and applies the upgrade with it', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('$92.56')).toBeVisible());
    paymentMocks.previewUpgrade.mockResolvedValueOnce({
      ...PRORATED_PREVIEW,
      previewToken: 'signed-promo-token',
      charge: {
        ...PRORATED_PREVIEW.charge,
        discountCents: 2_149,
        taxCents: 495,
        totalCents: 6_942,
        totalDueTodayCents: 6_942,
      },
      promotion: {
        code: 'SPRING',
        percentOff: 25,
        amountOffCents: null,
        currency: null,
        duration: 'once',
        durationInMonths: null,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add a promotion code' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Promotion code' }), {
      target: { value: 'SPRING' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const order = screen.getByRole('region', { name: 'Order details' });
    expect(await within(order).findByText('Discount (SPRING)')).toBeVisible();
    expect(within(order).getByText('$69.42')).toBeVisible();
    expect(paymentMocks.previewUpgrade).toHaveBeenLastCalledWith(
      expect.objectContaining({ plan: 'max', promotionCode: 'SPRING' }),
    );

    fireEvent.click(screen.getByRole('checkbox'));
    const subscribe = screen.getByRole('button', { name: /subscribe to/i });
    await waitFor(() => expect(subscribe).toBeEnabled());
    fireEvent.click(subscribe);

    await waitFor(() =>
      expect(paymentMocks.upgradePlanMidCycle).toHaveBeenCalledWith({
        plan: 'max',
        billingInterval: 'monthly',
        previewToken: 'signed-promo-token',
        promotionCode: 'SPRING',
      }),
    );
  });

  it('states the monthly cadence every individual plan is sold with', async () => {
    renderPanel();

    const notice = await screen.findByText(/auto renew/i);
    expect(notice).toHaveTextContent(/\/month \+ tax/);
    expect(notice).not.toHaveTextContent('/year');
  });

  it('returns from the portal to the order screen it was opened from', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));

    await waitFor(() =>
      expect(paymentMocks.openBillingPortal).toHaveBeenCalledWith('/upgrade/max'),
    );
  });

  describe('starting a plan from free, where Stripe Checkout takes over', () => {
    beforeEach(() => {
      const checkoutRequired = new actualErrors.CheckoutRequiredError(
        'Starting this paid plan requires Stripe Checkout.',
        700,
        'usd',
      );
      paymentMocks.previewUpgrade.mockRejectedValue(checkoutRequired);
      paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([]);
      waitlistState.status = { joinedPlans: [], upgradeGateEnabled: true, accessGranted: true };
      holdAccount(FREE_ACCOUNT);
    });

    it('does not call the plan price a total, because tax is added at checkout', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByText('$7.00')).toBeVisible();
      expect(screen.getByRole('definition')).toHaveTextContent('$7.00');
      expect(screen.getByRole('term')).not.toHaveTextContent(/total/i);
      expect(screen.getByText(/tax is calculated at checkout/i)).toBeVisible();
      // Quoting "$7.00 total due today" would understate the actual charge.
      expect(screen.queryByText(/total due today/i)).toBeNull();
    });

    it('hides the payment method section instead of offering a dead Add button', async () => {
      // A free account has no Stripe customer, so opening the portal to add a
      // card errors. Checkout collects the card on its own page.
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      await screen.findByText('$7.00');
      expect(screen.queryByRole('region', { name: 'Payment method' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    });

    it('sends the user to checkout rather than trying to charge a card it has not got', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const subscribe = await screen.findByRole('button', { name: /subscribe to/i });
      fireEvent.click(screen.getByRole('checkbox'));
      await waitFor(() => expect(subscribe).toBeEnabled());
      fireEvent.click(subscribe);

      await waitFor(() =>
        expect(paymentMocks.startPlanCheckout).toHaveBeenCalledWith({
          plan: 'basic',
          billingInterval: 'monthly',
        }),
      );
      expect(paymentMocks.upgradePlanMidCycle).not.toHaveBeenCalled();
    });
  });

  describe('starting a plan from free while paid upgrades are staged', () => {
    beforeEach(() => {
      paymentMocks.previewUpgrade.mockRejectedValue(
        new actualErrors.CheckoutRequiredError(
          'Starting this paid plan requires Stripe Checkout.',
          700,
          'usd',
        ),
      );
      paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([]);
      waitlistState.status = { joinedPlans: [], upgradeGateEnabled: true, accessGranted: false };
      holdAccount(FREE_ACCOUNT);
      servePlanPrices({ amountMinor: 700, currency: 'usd' });
    });

    it('offers the upgrade waitlist instead of a checkout the server would refuse', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByRole('region', { name: 'basic upgrade waitlist' })).toBeVisible();
      expect(await screen.findByText('$7/month + tax')).toBeVisible();
      expect(screen.queryByRole('button', { name: /subscribe to/i })).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('prices the waitlisted plan in the currency the visitor would be charged', async () => {
      servePlanPrices({ amountMinor: 39_900, currency: 'inr' });
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const order = await screen.findByRole('region', { name: 'Order details' });
      expect(await within(order).findByText('₹399/month + tax')).toBeVisible();
      expect(within(order).queryByText(/\$7/)).toBeNull();
      expect(paymentMocks.previewUpgrade).not.toHaveBeenCalled();
    });

    it('promises no subscription or checkout while the account can only join the waitlist', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      await screen.findByRole('region', { name: 'basic upgrade waitlist' });
      expect(screen.queryByText(/auto renew/i)).toBeNull();
      expect(screen.queryByText(/tax is calculated at checkout/i)).toBeNull();
      expect(screen.queryByText(/you will then be charged/i)).toBeNull();
    });

    it('holds back a referral trial it cannot start until upgrade access arrives', async () => {
      paymentMocks.previewUpgrade.mockRejectedValue(
        new actualErrors.CheckoutRequiredError(
          'Starting this paid plan requires Stripe Checkout.',
          0,
          'usd',
          { days: 14, convertsAt: '2026-10-16T12:00:00.000Z', amountCents: 700 },
        ),
      );
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const order = await screen.findByRole('region', { name: 'Order details' });
      expect(await within(order).findByText('$7/month + tax')).toBeVisible();
      expect(screen.queryByText(/free trial/i)).toBeNull();
      expect(screen.queryByText(/due today/i)).toBeNull();
      expect(screen.queryByText(/you will then be charged/i)).toBeNull();
      expect(screen.queryByText(/auto renew/i)).toBeNull();
    });

    it('keeps billing trouble off an order that only offers the waitlist', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByRole('region', { name: 'basic upgrade waitlist' })).toBeVisible();
      expect(screen.queryByTestId('service-notices')).toBeNull();
    });

    it('keeps the waitlist when upgrade access cannot be read', async () => {
      waitlistState.status = null;
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByRole('region', { name: 'basic upgrade waitlist' })).toBeVisible();
      expect(screen.queryByRole('button', { name: /subscribe to/i })).toBeNull();
    });

    it('offers the waitlist and the catalog price while the Stripe preview is still pending', async () => {
      paymentMocks.previewUpgrade.mockReturnValue(new Promise(() => undefined));
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByRole('region', { name: 'basic upgrade waitlist' })).toBeVisible();
      expect(await screen.findByText('$7/month + tax')).toBeVisible();
      expect(screen.queryByText(/You agree that AGI Workforce will charge/)).toBeNull();
      expect(screen.queryByRole('button', { name: /subscribe to/i })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Payment method' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Order details' })).toHaveAttribute(
        'aria-busy',
        'false',
      );
      expect(paymentMocks.previewUpgrade).not.toHaveBeenCalled();
    });

    it('still offers the waitlist when Stripe pricing fails, with no billing trouble shown', async () => {
      paymentMocks.previewUpgrade.mockRejectedValue(
        new Error('Checkout pricing is not configured for basic monthly in your region.'),
      );
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      expect(await screen.findByRole('region', { name: 'basic upgrade waitlist' })).toBeVisible();
      expect(screen.queryByText(/Checkout pricing is not configured/)).toBeNull();
      expect(screen.queryByText(/You agree that AGI Workforce will charge/)).toBeNull();
      expect(screen.queryByTestId('service-notices')).toBeNull();
      expect(paymentMocks.previewUpgrade).not.toHaveBeenCalled();
      expect(paymentMocks.fetchSavedPaymentMethods).not.toHaveBeenCalled();
    });

    it('holds every charge control back while upgrade access is being read', async () => {
      waitlistState.status = null;
      waitlistState.checking = true;
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const order = screen.getByRole('region', { name: 'Order details' });
      expect(order).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('region', { name: 'basic upgrade waitlist' })).toBeNull();
      expect(screen.queryByText(/You agree that AGI Workforce will charge/)).toBeNull();
      expect(screen.queryByRole('button', { name: /subscribe to/i })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Payment method' })).toBeNull();
      expect(paymentMocks.previewUpgrade).not.toHaveBeenCalled();
    });

    it('offers a retry instead of loading forever when the billing account cannot be read', async () => {
      const refreshUser = vi.fn(async () => undefined);
      useBillingStore.setState({
        subscription: null,
        initialized: true,
        isLoading: false,
        error: '/api/me returned 503',
        unauthenticated: false,
        refreshUser,
      });
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const order = screen.getByRole('region', { name: 'Order details' });
      expect(within(order).getByRole('alert')).toHaveTextContent(
        'We couldn’t load your billing account. Nothing has been charged.',
      );
      expect(order).toHaveAttribute('aria-busy', 'false');
      expect(screen.queryByText('Loading your account…')).toBeNull();
      expect(screen.queryByRole('button', { name: /subscribe to/i })).toBeNull();
      expect(paymentMocks.previewUpgrade).not.toHaveBeenCalled();

      fireEvent.click(within(order).getByRole('button', { name: 'Try again' }));
      expect(refreshUser).toHaveBeenCalledTimes(1);
    });

    it('asks for sign-in instead of loading forever when the session has expired', async () => {
      useBillingStore.setState({
        subscription: null,
        initialized: true,
        isLoading: false,
        error: null,
        unauthenticated: true,
      });
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      const order = screen.getByRole('region', { name: 'Order details' });
      expect(within(order).getByRole('alert')).toHaveTextContent(
        'Your session expired before we could read your plan. Nothing has been charged.',
      );
      expect(within(order).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
        'href',
        '/login?redirectTo=%2Fupgrade%2Fbasic',
      );
      expect(screen.queryByText('Loading your account…')).toBeNull();
    });

    it('opens the order for checkout once an access code is redeemed', async () => {
      render(<UpgradeOrderPanel plan="basic" returnPath="/upgrade/basic" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Redeem code' }));
      const subscribe = await screen.findByRole('button', { name: /subscribe to/i });
      fireEvent.click(screen.getByRole('checkbox'));
      await waitFor(() => expect(subscribe).toBeEnabled());
      fireEvent.click(subscribe);

      await waitFor(() =>
        expect(paymentMocks.startPlanCheckout).toHaveBeenCalledWith({
          plan: 'basic',
          billingInterval: 'monthly',
        }),
      );
    });
  });

  it('never sends a paying subscriber to the waitlist for a mid-cycle upgrade', async () => {
    waitlistState.status = { joinedPlans: [], upgradeGateEnabled: true, accessGranted: false };
    renderPanel();

    expect(await screen.findByRole('button', { name: /subscribe to/i })).toBeVisible();
    expect(screen.queryByRole('region', { name: /upgrade waitlist/ })).toBeNull();
  });

  it('states what recurs after today, not just the prorated total', async () => {
    renderPanel();

    const notice = await screen.findByText(/auto renew/i);
    expect(notice).toHaveTextContent('Sep 17, 2026');
    expect(notice).toHaveTextContent('$100/month + tax');
  });

  // Production, 2026-08-19: every Stripe price id was a test-mode object while
  // the secret key was live, so the preview 400'd for every plan and the order
  // card rendered its heading over an empty body.
  it('says there is no order rather than showing an empty card when the preview fails', async () => {
    paymentMocks.previewUpgrade.mockRejectedValue(
      new Error('Checkout pricing is not configured for max monthly in your region.'),
    );
    renderPanel();

    expect(await screen.findByText(/no charge could be calculated/i)).toBeVisible();
    expect(
      screen.getByText('Checkout pricing is not configured for max monthly in your region.'),
    ).toBeVisible();

    // Nothing was priced, so consent cannot enable a charge either.
    const subscribe = screen.getByRole('button', { name: /subscribe to/i });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(subscribe).toBeDisabled();
  });
});
