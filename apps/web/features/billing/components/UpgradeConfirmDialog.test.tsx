import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  startPlanCheckout: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
}));

vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    Button: ({
      children,
      disabled,
      onClick,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

vi.mock('../services/stripe-payments', () => {
  class CheckoutRequiredError extends Error {
    amountDueNowCents: number;
    currency: string;

    constructor(message: string, amountDueNowCents = 0, currency = 'usd') {
      super(message);
      this.amountDueNowCents = amountDueNowCents;
      this.currency = currency;
    }
  }
  return {
    CheckoutRequiredError,
    previewUpgrade: paymentMocks.previewUpgrade,
    startPlanCheckout: paymentMocks.startPlanCheckout,
    upgradePlanMidCycle: paymentMocks.upgradePlanMidCycle,
  };
});

import { CheckoutRequiredError } from '../services/stripe-payments';
import { UpgradeConfirmDialog } from './UpgradeConfirmDialog';

describe('UpgradeConfirmDialog', () => {
  it('discloses the full price when there is no paid Stripe charge to prorate', async () => {
    paymentMocks.previewUpgrade.mockRejectedValueOnce(
      new CheckoutRequiredError('Continue through secure checkout.', 20_000, 'usd'),
    );
    paymentMocks.startPlanCheckout.mockResolvedValueOnce(undefined);

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max_15x', billingInterval: 'monthly' }}
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    const continueButton = await screen.findByRole('button', {
      name: 'Start Max 15x · pay $200.00',
    });
    expect(screen.getByText(/no paid Stripe charge to credit/i)).toBeTruthy();
    expect(screen.getByText(/\$200\.00 today/i)).toBeTruthy();
    expect(screen.queryByText(/prorated for the rest/i)).toBeNull();

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(paymentMocks.startPlanCheckout).toHaveBeenCalledWith({
        plan: 'max_15x',
        billingInterval: 'monthly',
      });
    });
    expect(paymentMocks.upgradePlanMidCycle).not.toHaveBeenCalled();
  });

  it('renews a per-seat plan at unit price x seats', async () => {
    paymentMocks.previewUpgrade.mockResolvedValueOnce({
      amountDueNowCents: 1_234,
      currency: 'usd',
      previewToken: 'tok_seat',
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'team', billingInterval: 'monthly', seats: 3 }}
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    // Team publishes $25/seat/month, so 3 seats renew at $75 — quoting the $25
    // unit price would understate the org's bill by the seat count.
    expect(await screen.findByText(/renewal date stays the same, at \$75\/month/i)).toBeTruthy();
  });

  it('quotes the published catalog amount for the requested interval', async () => {
    paymentMocks.previewUpgrade.mockResolvedValueOnce({
      amountDueNowCents: 500,
      currency: 'usd',
      previewToken: 'tok_pro_yearly',
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'pro', billingInterval: 'yearly' }}
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    // Pro yearly is $200 in the catalog. Quoting the monthly $20 as the annual
    // renewal is the misstatement this pins.
    expect(await screen.findByText(/renewal date stays the same, at \$200\/year/i)).toBeTruthy();
  });
});
