import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublishedPlanPriceUsd } from '@agiworkforce/types';
type ScanModule0 = typeof import('../../services/stripe-payments');

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  startPlanCheckout: vi.fn(),
}));

vi.mock('../../services/stripe-payments', async () => {
  const actual = await vi.importActual<ScanModule0>('../../services/stripe-payments');
  return { ...actual, ...paymentMocks };
});

import { UpgradeConfirmDialog } from '../UpgradeConfirmDialog';
import { formatBillingDate } from '../../lib/billing-format';
import { formatCatalogPrice, getBillingPlanDisplay } from '../../lib/plan-display';

describe('UpgradeConfirmDialog order details', () => {
  beforeEach(() => vi.clearAllMocks());

  it('itemizes the charge exactly as Stripe will invoice it', async () => {
    // Transcribed from Anthropic invoice DGHE2KZA-0007 (Max 5x -> Max 20x):
    // $200.00 for the new period, -$89.13 unused time, $7.32 tax, $118.19 taken.
    paymentMocks.previewUpgrade.mockResolvedValue({
      amountDueNowCents: 11_819,
      currency: 'usd',
      previewToken: 'tok_preview',
      charge: {
        lineItems: [
          { description: 'Max plan - 20x', amountCents: 20_000 },
          { description: 'Unused time on Max plan - 5x after 26 Feb 2026', amountCents: -8_913 },
        ],
        subtotalCents: 11_087,
        discountCents: 0,
        taxCents: 732,
        totalCents: 11_819,
        appliedBalanceCents: 0,
        totalDueTodayCents: 11_819,
        renewsAt: '2026-03-26T00:00:00.000Z',
      },
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max', billingInterval: 'monthly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    const receipt = await screen.findByRole('region', { name: 'Order details' });

    // The credit for unused time is the line a user most needs to see: without
    // it the charge looks like the full sticker price of the new plan.
    expect(receipt).toHaveTextContent('Unused time on Max plan - 5x after 26 Feb 2026');
    expect(receipt).toHaveTextContent('-$89.13');
    expect(receipt).toHaveTextContent('$200.00');
    expect(receipt).toHaveTextContent('$110.87');
    expect(receipt).toHaveTextContent('$7.32');
    expect(receipt).toHaveTextContent('$118.19');
  });

  it('separates Total from Total due today when a stripe balance is applied', async () => {
    paymentMocks.previewUpgrade.mockResolvedValue({
      amountDueNowCents: 2_135,
      currency: 'usd',
      previewToken: 'tok_preview',
      charge: {
        lineItems: [{ description: 'Pro plan', amountCents: 2_000 }],
        subtotalCents: 2_000,
        discountCents: 0,
        taxCents: 132,
        totalCents: 2_132,
        appliedBalanceCents: 3,
        totalDueTodayCents: 2_135,
        renewsAt: '2026-09-17T00:00:00.000Z',
      },
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'pro', billingInterval: 'monthly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    const receipt = await screen.findByRole('region', { name: 'Order details' });
    expect(receipt).toHaveTextContent('Applied balance');
    expect(receipt).toHaveTextContent('$21.32');
    expect(receipt).toHaveTextContent('$0.03');
    expect(receipt).toHaveTextContent('$21.35');
  });

  it('states the amount on the confirm button so it cannot disagree with the receipt', async () => {
    paymentMocks.previewUpgrade.mockResolvedValue({
      amountDueNowCents: 8_596,
      currency: 'usd',
      previewToken: 'tok_preview',
      charge: {
        lineItems: [
          { description: 'Max plan - 5x', amountCents: 10_000 },
          { description: 'Unused time on Claude Pro after 23 Feb 2026', amountCents: -1_936 },
        ],
        subtotalCents: 8_064,
        discountCents: 0,
        taxCents: 532,
        totalCents: 8_596,
        appliedBalanceCents: 0,
        totalDueTodayCents: 8_596,
        renewsAt: null,
      },
    });

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max', billingInterval: 'monthly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /pay \$85\.96/i })).toBeInTheDocument(),
    );
    expect(await screen.findByRole('region', { name: 'Order details' })).toHaveTextContent(
      '$85.96',
    );
  });
  const previewWithRenewal = (renewsAt: string | null) => ({
    amountDueNowCents: 8_596,
    currency: 'usd',
    previewToken: 'tok_preview',
    charge: {
      lineItems: [{ description: 'Max plan - 5x', amountCents: 10_000 }],
      subtotalCents: 8_064,
      discountCents: 0,
      taxCents: 532,
      totalCents: 8_596,
      appliedBalanceCents: 0,
      totalDueTodayCents: 8_596,
      renewsAt,
    },
  });

  it('leads with the new plan name, its price and when it renews', async () => {
    paymentMocks.previewUpgrade.mockResolvedValue(previewWithRenewal('2026-03-26T00:00:00.000Z'));

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max', billingInterval: 'monthly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    const summary = await screen.findByRole('region', { name: 'Plan summary' });
    const price = getPublishedPlanPriceUsd('max', 'monthly');
    expect(summary).toHaveTextContent(getBillingPlanDisplay('max').pricing.label);
    expect(summary).toHaveTextContent(`${formatCatalogPrice(price!)}/month`);
    expect(summary).toHaveTextContent(`Renews ${formatBillingDate('2026-03-26T00:00:00.000Z')}`);
    expect(
      screen.getByRole('region', { name: 'Order details' }).compareDocumentPosition(summary) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('states the billing cadence when Stripe returns no renewal date', async () => {
    paymentMocks.previewUpgrade.mockResolvedValue(previewWithRenewal(null));

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max', billingInterval: 'yearly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    expect(await screen.findByRole('region', { name: 'Plan summary' })).toHaveTextContent(
      'Billed yearly',
    );
  });

  it('shows a spinner in the Confirm button while the upgrade is in progress', async () => {
    paymentMocks.previewUpgrade.mockResolvedValue(previewWithRenewal(null));
    paymentMocks.upgradePlanMidCycle.mockReturnValue(new Promise(() => {}));

    render(
      <UpgradeConfirmDialog
        request={{ plan: 'max', billingInterval: 'monthly' }}
        onCancel={() => {}}
        onConfirmed={() => {}}
      />,
    );

    const confirm = await screen.findByRole('button', { name: /pay \$85\.96/i });
    expect(confirm.querySelector('.animate-spin')).toBeNull();
    fireEvent.click(confirm);

    const busy = await screen.findByRole('button', { name: /Upgrading/ });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();
    expect(busy.querySelector('.animate-spin')).not.toBeNull();
    expect(within(busy).getByText(/Upgrading/)).toBeTruthy();
  });
});
