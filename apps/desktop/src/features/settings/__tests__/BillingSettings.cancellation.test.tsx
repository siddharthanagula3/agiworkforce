import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  subscriptionStatus: 'active',
  currentPeriodEnd: Date.UTC(2026, 8, 1),
  planDisplayName: 'Pro',
  subscriptionCancelAtPeriodEnd: true,
  subscriptionSource: 'stripe',
  subscriptionFetchStatus: 'succeeded',
}));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => true,
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('../../../lib/stripeCheckout', () => ({
  openBillingPortal: vi.fn(),
}));

import { BillingSettings } from '../BillingSettings';

describe('BillingSettings scheduled cancellation', () => {
  beforeEach(() => {
    Object.assign(authState, {
      subscriptionStatus: 'active',
      subscriptionCancelAtPeriodEnd: true,
      subscriptionSource: 'stripe',
      subscriptionFetchStatus: 'succeeded',
    });
  });

  it('does not tell an active subscription scheduled to cancel that it renews', () => {
    render(<BillingSettings />);

    expect(screen.getByText('Active · cancellation scheduled')).toBeInTheDocument();
    expect(screen.getByText('Access ends')).toBeInTheDocument();
    expect(screen.queryByText('Renews')).not.toBeInTheDocument();
  });

  it('does not offer Stripe billing for an Apple-owned subscription', () => {
    Object.assign(authState, {
      subscriptionCancelAtPeriodEnd: false,
      subscriptionSource: 'apple',
    });

    render(<BillingSettings />);

    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText(/managed by Apple/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage billing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare plans' })).not.toBeInTheDocument();
  });

  it('describes an already canceled period as ended', () => {
    Object.assign(authState, {
      subscriptionStatus: 'canceled',
      subscriptionCancelAtPeriodEnd: false,
    });

    render(<BillingSettings />);

    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.queryByText('Renews')).not.toBeInTheDocument();
    expect(screen.queryByText('Access ends')).not.toBeInTheDocument();
  });
});
