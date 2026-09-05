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
  cancel_at_period_end?: boolean;
}

let mockSubscription: MockSubscription = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: 1_800_000_000,
};
let mockBillingInitialized = true;
let mockBillingLoading = false;
let mockBillingError: string | null = null;
const mockRefreshUser = vi.fn();

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: mockSubscription,
      initialized: mockBillingInitialized,
      isLoading: mockBillingLoading,
      error: mockBillingError,
      refreshUser: mockRefreshUser,
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
  mockBillingInitialized = true;
  mockBillingLoading = false;
  mockBillingError = null;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('BillingSection', () => {
  it('does not present an unhydrated account as Free', () => {
    mockBillingInitialized = false;
    mockBillingLoading = true;
    global.fetch = vi.fn();

    render(<BillingSection />);

    expect(screen.getByText('Loading your billing account…')).toBeTruthy();
    expect(screen.queryByText('Free plan')).toBeNull();
  });

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
    expect(screen.queryByText('Adjust plan')).toBeNull();
    expect(
      screen.getByText(
        'Change or cancel this subscription with Apple before starting web billing.',
      ),
    ).toBeTruthy();

    // No Stripe round-trips for an account with no Stripe customer, but the
    // credit ledger still applies to it (usage debits happen regardless of
    // who bills the subscription), so credit-history is the one call an
    // Apple-billed account does make.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/billing/payment-methods', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/billing/invoices', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/billing/overage', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/credit-history', {
      credentials: 'include',
    });
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
  // than saying why, leaving a paying contract customer with no price state at
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
    expect(screen.getByText('Custom, set by your contract')).toBeTruthy();
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

  it('labels an operator-provisioned plan without inventing Stripe controls', () => {
    mockSubscription.subscription_source = 'manual';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('your organization')).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(screen.queryByText('Payment')).toBeNull();
    expect(screen.queryByText('Adjust plan')).toBeNull();
    expect(
      screen.getByText(
        'This plan is managed by your organization. Contact an administrator to change it.',
      ),
    ).toBeTruthy();
    // Same distinction as the Apple-billed case above: no Stripe round-trips,
    // but the credit ledger is not Stripe-specific.
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/billing/payment-methods',
      expect.anything(),
    );
    expect(global.fetch).not.toHaveBeenCalledWith('/api/billing/invoices', expect.anything());
    expect(global.fetch).not.toHaveBeenCalledWith('/api/billing/overage', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/credit-history', {
      credentials: 'include',
    });
  });

  it('offers web plans again after a store-owned subscription is terminal', () => {
    mockSubscription.subscription_source = 'apple';
    mockSubscription.status = 'expired';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('Adjust plan')).toBeTruthy();
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

  it('keeps failed billing detail requests distinct from honest empty states', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: false,
        status: url.includes('payment-methods') ? 503 : 401,
        json: async () => ({}),
      } as Response;
    });

    render(<BillingSection />);

    expect(await screen.findByText('Payment methods could not be loaded (503).')).toBeTruthy();
    expect(await screen.findByText('Invoices could not be loaded (401).')).toBeTruthy();
    expect(screen.queryByText('No card on file')).toBeNull();
    expect(
      screen.queryByText(
        'No invoices yet. Invoices appear here once your first billing cycle closes.',
      ),
    ).toBeNull();
  });

  it('keeps recovery billing controls available when a Stripe plan is past due', async () => {
    mockSubscription.status = 'past_due';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('Manage billing')).toBeTruthy();
    expect(screen.getByText('Payment')).toBeTruthy();
    expect(await screen.findByText('No card on file')).toBeTruthy();
  });

  it('humanizes the raw subscription status enum instead of leaking underscores', async () => {
    mockSubscription.status = 'past_due';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(await screen.findByText('Past due')).toBeTruthy();
    expect(screen.queryByText('past_due')).toBeNull();
    expect(screen.queryByText('Past_due')).toBeNull();
  });

  it('distinguishes renewal from a scheduled cancellation', () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    const { unmount } = render(<BillingSection />);
    expect(screen.getByText('Renews on')).toBeTruthy();
    unmount();

    mockSubscription.cancel_at_period_end = true;
    render(<BillingSection />);
    expect(screen.getByText('Cancels on')).toBeTruthy();
    expect(screen.queryByText('Renews on')).toBeNull();
  });
});

describe('past-due payment notice', () => {
  // invoice.payment_failed sets the subscription to past_due server-side, but
  // this panel rendered nothing about it, so a user whose card was declined
  // had no way to learn that from the product - and /payment-failure, the page
  // written to explain it, had no inbound link from anywhere.
  it('says the payment failed and links to the explainer', async () => {
    mockSubscription = { ...mockSubscription, status: 'past_due' };
    render(<BillingSection />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('did not go through');
    expect(alert.textContent).toContain('past due');
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('/payment-failure');
  });

  it('stays silent on a healthy subscription', async () => {
    mockSubscription = { ...mockSubscription, status: 'active' };
    render(<BillingSection />);
    await waitFor(() => expect(screen.getByText(/Pro/)).toBeTruthy());
    expect(screen.queryByText(/did not go through/)).toBeNull();
  });
});

describe('BillingSection row density', () => {
  it('shows a skeleton, not visible loading text, while the account loads', () => {
    mockBillingInitialized = false;
    mockBillingLoading = true;
    global.fetch = vi.fn();

    render(<BillingSection />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading your billing account…');
    expect(status.className).toContain('sr-only');
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders the plan, payment and invoices rows without a bordered card', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    const adjustPlan = await screen.findByText('Adjust plan');
    expect(adjustPlan.closest('section')).toBeNull();
    const payment = screen.getByText('Payment');
    expect(payment.closest('section')).toBeNull();
    const invoices = screen.getByText('Invoices');
    expect(invoices.closest('section')).toBeNull();
  });
});
