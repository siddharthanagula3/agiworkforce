import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSubscription = {
  tier: string;
  status: string;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
} | null;

const billingState = vi.hoisted(() => ({
  subscription: { tier: 'pro', status: 'active' } as MockSubscription,
  refreshUser: vi.fn(async () => {}),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: typeof billingState) => unknown) => selector(billingState),
}));

import { UpgradeWelcome } from './UpgradeWelcome';

/** 2026-09-14T00:00:00Z, as Stripe reports it: seconds, not milliseconds. */
const PERIOD_END_UNIX = Math.floor(Date.UTC(2026, 8, 14) / 1000);

describe('UpgradeWelcome', () => {
  beforeEach(() => {
    billingState.subscription = { tier: 'pro', status: 'active' };
    billingState.refreshUser.mockClear();
  });

  it('does not mistake the previous paid tier for the checkout target', () => {
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByRole('heading', { name: 'Payment received.' })).toBeInTheDocument();
    expect(screen.getByText('Activating your Max 15x plan…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /all set/i })).toBeNull();
    unmount();
  });

  it('requires the exact target to have an entitled status before claiming activation', () => {
    billingState.subscription = { tier: 'max_15x', status: 'canceled' };
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByText('Activating your Max 15x plan…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /all set/i })).toBeNull();
    unmount();
  });

  it('confirms only after the exact checkout target is active, and names the plan beside it', () => {
    billingState.subscription = { tier: 'max_15x', status: 'active' };
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByRole('heading', { name: /all set/i })).toBeInTheDocument();
    // The tier belongs beside the price as a fact, not inside the headline
    // where "Welcome to Basic." reads as a verdict on the product.
    expect(screen.getByText('Max 15x')).toBeInTheDocument();
    expect(screen.getByText('$200/month')).toBeInTheDocument();
    expect(screen.queryByText(/Activating your/i)).toBeNull();
    expect(billingState.refreshUser).not.toHaveBeenCalled();
    unmount();
  });

  it('says a period that will not renew "ends" rather than "renews"', () => {
    billingState.subscription = {
      tier: 'basic',
      status: 'active',
      current_period_end: PERIOD_END_UNIX,
      cancel_at_period_end: true,
    };
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="basic" />);

    // Inventing a renewal for a period that is scheduled to lapse is the one
    // thing a payment confirmation must never do.
    expect(screen.getByText(/^ends /)).toBeInTheDocument();
    expect(screen.queryByText(/^renews /)).toBeNull();
    unmount();
  });

  it('omits the renewal line entirely when no period end is known', () => {
    billingState.subscription = { tier: 'basic', status: 'active', current_period_end: null };
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="basic" />);

    expect(screen.getByRole('heading', { name: /all set/i })).toBeInTheDocument();
    expect(screen.queryByText(/renews|ends/i)).toBeNull();
    unmount();
  });
});
