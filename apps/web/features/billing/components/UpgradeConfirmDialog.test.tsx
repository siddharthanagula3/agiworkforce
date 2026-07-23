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
  class CheckoutRequiredError extends Error {}
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
  it('offers secure checkout when the stored subscription is not live in Stripe', async () => {
    paymentMocks.previewUpgrade.mockRejectedValueOnce(
      new CheckoutRequiredError('Continue through secure checkout.'),
    );
    paymentMocks.startPlanCheckout.mockResolvedValueOnce(undefined);

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max_15x', billingInterval: 'monthly' }}
        onCancel={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    const continueButton = await screen.findByRole('button', { name: 'Continue to checkout' });
    expect(screen.getByText(/secure checkout/i)).toBeTruthy();

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(paymentMocks.startPlanCheckout).toHaveBeenCalledWith({
        plan: 'max_15x',
        billingInterval: 'monthly',
      });
    });
    expect(paymentMocks.upgradePlanMidCycle).not.toHaveBeenCalled();
  });
});
