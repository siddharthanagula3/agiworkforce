import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openBillingPortal: vi.fn(),
  refreshUserData: vi.fn(),
  signOut: vi.fn(),
  account: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Example User',
    avatar: null,
    plan: 'pro',
    planDisplayName: 'Pro',
    subscriptionStatus: 'active',
    subscriptionFetchStatus: 'succeeded',
    currentPeriodEnd: Date.UTC(2026, 8, 1),
    subscriptionCancelAtPeriodEnd: false,
    subscriptionSource: 'stripe',
    stripeCustomerId: null,
    featureFlags: {},
    credits: null,
    accessToken: 'desktop-token',
    refreshToken: null,
    deviceLinkId: null,
    deviceLinkCode: null,
    createdAt: 0,
    lastSyncedAt: 0,
  },
}));

vi.mock('../../../stores/auth', () => ({
  useAccountStore: (selector: (state: { account: typeof mocks.account }) => unknown) =>
    selector({ account: mocks.account }),
  useAuthStore: {
    getState: () => ({ signOut: mocks.signOut }),
  },
}));

vi.mock('../../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    openAccountManagement: vi.fn(),
    refreshUserData: mocks.refreshUserData,
  },
}));

vi.mock('../../../lib/stripeCheckout', () => ({
  openBillingPortal: mocks.openBillingPortal,
}));

import { AccountSettings } from '../AccountSettings';

describe('AccountSettings subscription ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.account, {
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
      subscriptionCancelAtPeriodEnd: false,
      subscriptionSource: 'stripe',
    });
    mocks.openBillingPortal.mockResolvedValue(null);
  });

  it('offers the billing portal only for a Stripe-owned subscription', () => {
    render(<AccountSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }));
    expect(mocks.openBillingPortal).toHaveBeenCalledOnce();
  });

  it('describes Apple ownership without offering Stripe management', () => {
    Object.assign(mocks.account, { subscriptionSource: 'apple' });

    render(<AccountSettings />);

    expect(screen.getByText(/managed by Apple/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View plans' })).not.toBeInTheDocument();
  });
});
