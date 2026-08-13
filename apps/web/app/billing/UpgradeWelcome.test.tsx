import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const billingState = vi.hoisted(() => ({
  subscription: {
    tier: 'pro',
    status: 'active',
  } as { tier: string; status: string } | null,
  refreshUser: vi.fn(async () => {}),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: typeof billingState) => unknown) => selector(billingState),
}));

import { UpgradeWelcome } from './UpgradeWelcome';

describe('UpgradeWelcome', () => {
  beforeEach(() => {
    billingState.subscription = { tier: 'pro', status: 'active' };
    billingState.refreshUser.mockClear();
  });

  it('does not mistake the previous paid tier for the checkout target', () => {
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByRole('heading', { name: 'Payment received.' })).toBeInTheDocument();
    expect(screen.getByText('Activating your Max 15x plan…')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Pro.')).toBeNull();
    expect(screen.queryByText('Welcome to Max 15x.')).toBeNull();
    unmount();
  });

  it('requires the exact target to have an entitled status before claiming activation', () => {
    billingState.subscription = { tier: 'max_15x', status: 'canceled' };
    const { unmount } = render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByText('Activating your Max 15x plan…')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Max 15x.')).toBeNull();
    unmount();
  });

  it('welcomes the user only after the exact checkout target is active', () => {
    billingState.subscription = { tier: 'max_15x', status: 'active' };
    render(<UpgradeWelcome checkoutState="paid" expectedPlan="max_15x" />);

    expect(screen.getByRole('heading', { name: 'Welcome to Max 15x.' })).toBeInTheDocument();
    expect(screen.queryByText(/Activating your/i)).toBeNull();
    expect(billingState.refreshUser).not.toHaveBeenCalled();
  });
});
