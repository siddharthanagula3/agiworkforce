import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const billingMocks = vi.hoisted(() => ({
  openBillingPortal: vi.fn(),
  startTopUpCheckout: vi.fn(),
}));

vi.mock('@/features/billing/services/stripe-payments', () => billingMocks);

interface MockSubscription {
  tier: string;
  display_name: string;
  status: string;
  current_period_end: number | null;
  subscription_source?: string;
}

let mockSubscription: MockSubscription = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: 1_800_000_000,
};

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: mockSubscription,
      creditBalance_cents: 1_200,
      dailyUsage_cents: 300,
      dailyLimit_cents: 500,
    }),
}));

import { BillingSection } from '../BillingSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscription = {
    tier: 'pro',
    display_name: 'Pro',
    status: 'active',
    current_period_end: 1_800_000_000,
    subscription_source: 'stripe',
  };
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('BillingSection', () => {
  it('shows public relative usage copy without private ledger values', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('5x more usage than Basic')).toBeTruthy();
    expect(screen.queryByText('Credit balance')).toBeNull();
    expect(screen.queryByText("Today's usage")).toBeNull();
    expect(screen.queryByText('$12.00')).toBeNull();
    expect(screen.queryByText('$3.00')).toBeNull();
  });

  // BIZ-044: the billing owner is one of the diagnostics a customer must be
  // able to read for themselves. It also decides which management control is
  // real: /api/portal can only open a session for a Stripe-billed row.
  it('names the billing owner and keeps the Stripe portal for a Stripe-billed plan', () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('Billed through')).toBeTruthy();
    expect(screen.getByText('AGI Workforce (card on file)')).toBeTruthy();
    expect(screen.getByText('Manage billing')).toBeTruthy();
  });

  it('sends an App Store-billed plan to Apple instead of the Stripe portal', () => {
    mockSubscription.subscription_source = 'apple';
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    global.fetch = fetchMock;

    render(<BillingSection />);

    expect(screen.getByText('the Apple App Store')).toBeTruthy();

    const manage = screen.getByText('Manage in the App Store') as HTMLAnchorElement;
    expect(manage.getAttribute('href')).toBe('https://apps.apple.com/account/subscriptions');

    // The Stripe-only controls are gone: the portal button, and the card row
    // that would render "No card on file" for a card Apple holds.
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(screen.queryByText('No card on file')).toBeNull();
    expect(screen.queryByText('Add payment method')).toBeNull();

    // No Stripe round-trips for an account with no Stripe customer.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a Play-billed plan to Google and says where receipts live', () => {
    mockSubscription.subscription_source = 'google';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('Google Play')).toBeTruthy();
    const manage = screen.getByText('Manage on Google Play') as HTMLAnchorElement;
    expect(manage.getAttribute('href')).toBe('https://play.google.com/store/account/subscriptions');
    expect(
      screen.getByText(
        'Receipts for this plan are issued by Google Play and are not available here.',
      ),
    ).toBeTruthy();
  });

  // BIZ-020: the Price row reads `subscription.tier` at runtime, so a negotiated
  // Enterprise entitlement lands here. The catalog holds no amount for it, and
  // the previous `monthlyPriceUsd > 0` guard silently dropped the row rather
  // than saying why — leaving a paying contract customer with no price state at
  // all. It must name the contract, and it must never print a dollar figure the
  // catalog does not have.
  it('states contract pricing for an Enterprise plan instead of an amount', () => {
    mockSubscription = {
      tier: 'enterprise',
      display_name: 'Enterprise',
      status: 'active',
      current_period_end: 1_800_000_000,
      subscription_source: 'manual',
    };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Custom — set by your contract')).toBeTruthy();
    expect(screen.queryByText('$0/mo')).toBeNull();
    expect(screen.queryByText('Free')).toBeNull();
  });

  it('prints the published amount for a plan that has one, per seat when it is per seat', () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    const { unmount } = render(<BillingSection />);
    expect(screen.getByText('$20/mo')).toBeTruthy();
    unmount();

    mockSubscription = {
      tier: 'team',
      display_name: 'Team',
      status: 'active',
      current_period_end: 1_800_000_000,
      subscription_source: 'stripe',
    };
    render(<BillingSection />);
    expect(screen.getByText('$25/mo per seat')).toBeTruthy();
  });

  it('labels an operator-provisioned plan without removing the portal', () => {
    mockSubscription.subscription_source = 'manual';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('your organization')).toBeTruthy();
    // A manual row may still have a Stripe customer carrying past invoices, so
    // the portal stays reachable.
    expect(screen.getByText('Manage billing')).toBeTruthy();
  });

  it('shows the $10 minimum and sends the canonical 500-unit top-up to checkout', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    billingMocks.startTopUpCheckout.mockResolvedValue(undefined);

    render(<BillingSection />);

    expect(screen.getByText('50 units for every $1')).toBeTruthy();
    expect(screen.getByText(/Minimum \$10/)).toBeTruthy();
    const buyButton = screen.getByRole('button', { name: 'Buy 500 units · $10' });
    fireEvent.click(buyButton);
    await waitFor(() => expect(billingMocks.startTopUpCheckout).toHaveBeenCalledWith(10));
  });

  it('disables top-up checkout below the minimum', () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    render(<BillingSection />);

    fireEvent.change(screen.getByLabelText('Custom top-up amount in dollars'), {
      target: { value: '9' },
    });
    expect(screen.getByRole('button', { name: 'Minimum $10' })).toBeDisabled();
  });
});
