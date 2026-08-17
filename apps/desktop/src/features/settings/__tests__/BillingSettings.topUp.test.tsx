import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_TOP_UP_AMOUNT_USD, TOP_UP_UNITS_PER_USD } from '@agiworkforce/types';

const authState = vi.hoisted(() => ({
  subscriptionStatus: 'active',
  currentPeriodEnd: Date.UTC(2026, 8, 1),
  planDisplayName: 'Pro',
  subscriptionCancelAtPeriodEnd: false,
  subscriptionSource: 'stripe',
  subscriptionFetchStatus: 'succeeded',
}));

const openTopUpCheckout = vi.hoisted(() => vi.fn(async () => null as string | null));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => true,
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('../../../lib/stripeCheckout', () => ({
  openBillingPortal: vi.fn(),
  openTopUpCheckout,
}));

import { BillingSettings } from '../BillingSettings';

describe('BillingSettings usage top-up', () => {
  beforeEach(() => {
    openTopUpCheckout.mockClear();
    openTopUpCheckout.mockResolvedValue(null);
    Object.assign(authState, {
      subscriptionStatus: 'active',
      subscriptionSource: 'stripe',
      subscriptionFetchStatus: 'succeeded',
    });
  });

  it('offers a top-up purchase that reaches checkout with the selected amount', async () => {
    const user = userEvent.setup();
    render(<BillingSettings />);

    const buy = screen.getByRole('button', {
      name: `Buy ${(MIN_TOP_UP_AMOUNT_USD * TOP_UP_UNITS_PER_USD).toLocaleString('en-US')} units · $${MIN_TOP_UP_AMOUNT_USD}`,
    });
    await user.click(buy);

    await waitFor(() => expect(openTopUpCheckout).toHaveBeenCalledWith(MIN_TOP_UP_AMOUNT_USD));
  });

  it('surfaces the checkout refusal instead of failing silently', async () => {
    openTopUpCheckout.mockResolvedValue('Top-up balance storage is being prepared.');
    const user = userEvent.setup();
    render(<BillingSettings />);

    await user.click(screen.getByRole('button', { name: /^Buy / }));

    expect(
      await screen.findByText('Top-up balance storage is being prepared.'),
    ).toBeInTheDocument();
  });

  it('does not offer a top-up for a store-owned subscription', () => {
    Object.assign(authState, { subscriptionSource: 'apple' });

    render(<BillingSettings />);

    expect(screen.queryByRole('button', { name: /^Buy / })).not.toBeInTheDocument();
    expect(screen.queryByText('Usage top-up')).not.toBeInTheDocument();
  });
});
