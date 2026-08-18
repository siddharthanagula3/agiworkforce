import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
});
