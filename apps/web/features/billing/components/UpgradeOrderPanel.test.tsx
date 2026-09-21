import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  startPlanCheckout: vi.fn(),
  fetchSavedPaymentMethods: vi.fn(),
  openBillingPortal: vi.fn(async () => {}),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ initialized: true, isAuthenticated: true, user: { id: 'user-1' } }),
}));

vi.mock('../services/stripe-payments', async () => {
  const actual = await vi.importActual<typeof import('../services/stripe-payments')>(
    '../services/stripe-payments',
  );
  return { ...actual, ...paymentMocks };
});

import * as actualErrors from '../services/stripe-payments';
import { UpgradeOrderPanel } from './UpgradeOrderPanel';

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
    taxCents: 660,
    totalCents: 9_256,
    appliedBalanceCents: 0,
    totalDueTodayCents: 9_256,
    renewsAt: '2026-09-17T12:00:00.000Z',
  },
};

function renderPanel() {
  render(<UpgradeOrderPanel plan="max" billingInterval="monthly" returnPath="/upgrade/max" />);
}

describe('UpgradeOrderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('states the yearly interval next to a yearly price', async () => {
    render(<UpgradeOrderPanel plan="max" billingInterval="yearly" returnPath="/upgrade/max" />);

    const notice = await screen.findByText(/auto renew/i);
    expect(notice).toHaveTextContent(/\/year \+ tax/);
    expect(notice).not.toHaveTextContent('/month');
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
    });

    it('does not call the plan price a total, because tax is added at checkout', async () => {
      render(
        <UpgradeOrderPanel plan="basic" billingInterval="monthly" returnPath="/upgrade/basic" />,
      );

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
      render(
        <UpgradeOrderPanel plan="basic" billingInterval="monthly" returnPath="/upgrade/basic" />,
      );

      await screen.findByText('$7.00');
      expect(screen.queryByRole('region', { name: 'Payment method' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    });

    it('sends the user to checkout rather than trying to charge a card it has not got', async () => {
      render(
        <UpgradeOrderPanel plan="basic" billingInterval="monthly" returnPath="/upgrade/basic" />,
      );

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
