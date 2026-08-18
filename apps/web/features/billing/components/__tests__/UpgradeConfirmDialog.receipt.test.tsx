import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  startPlanCheckout: vi.fn(),
}));

vi.mock('../../services/stripe-payments', async () => {
  const actual = await vi.importActual<typeof import('../../services/stripe-payments')>(
    '../../services/stripe-payments',
  );
  return { ...actual, ...paymentMocks };
});

import { UpgradeConfirmDialog } from '../UpgradeConfirmDialog';

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
        taxCents: 732,
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
        taxCents: 532,
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
});
