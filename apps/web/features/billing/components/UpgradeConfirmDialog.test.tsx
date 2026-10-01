import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@agiworkforce/ui');

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  startPlanCheckout: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const { translateUiPlural } = await importOriginal<ScanModule0>();
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    translateUiPlural,
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
      name: 'Start Max 20x · pay $200.00',
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

    expect(
      await screen.findByText(/After that, Team renews at \$75\/month plus tax/i),
    ).toBeTruthy();
  });

  it('quotes the published catalog amount for the requested interval', async () => {
    paymentMocks.previewUpgrade.mockResolvedValueOnce({
      amountDueNowCents: 500,
      currency: 'usd',
      previewToken: 'tok_team_yearly',
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'team', billingInterval: 'yearly', seats: 3 }}
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/After that, Team renews at \$720\/year plus tax/i),
    ).toBeTruthy();
  });
});
