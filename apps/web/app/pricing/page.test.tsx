import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';

const testState = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string }, initialized: true },
  billing: null as null | { plan: string; status: string },
  billingVersion: 0,
  account: {
    subscription: null as null | {
      tier: string;
      status: string;
      subscription_source?: 'none' | 'stripe' | 'apple' | 'google' | 'manual';
    },
    initialized: true,
    isLoading: false,
    error: null as string | null,
  },
}));

const stripeMocks = vi.hoisted(() => ({
  upgradeToBasicPlan: vi.fn(),
  upgradeToProPlan: vi.fn(),
  upgradeToMaxPlan: vi.fn(),
  upgradeToMax15xPlan: vi.fn(),
  upgradeToTeamPlan: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  previewUpgrade: vi.fn(),
  // Resolves rather than rejecting: in production this navigates away, so a
  // rejection would mean failure and the component would surface an error.
  openBillingPortal: vi.fn(async () => {}),
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

const billingMocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    refetch: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => listeners.forEach((listener) => listener()),
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => routerMocks }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'compareProInterval' && values?.['yearly']) {
        return `${key} ${String(values['yearly'])}`;
      }
      if (key === 'seatCadenceMonthly') {
        return `${String(values?.['count'])} seats · billed monthly`;
      }
      if (key === 'seatCadenceAnnual') {
        return `${String(values?.['count'])} seats · billed annually`;
      }
      if (key === 'perSeatPrice') return `${String(values?.['price'])}/seat/mo`;
      if (key === 'perSeatPriceAnnual') return `${String(values?.['price'])}/seat/mo`;
      return key;
    },
  }),
}));
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(testState.auth),
}));
vi.mock('@features/billing/services/stripe-payments', () => ({
  ...stripeMocks,
}));
// The real hook re-renders on refetch; a plain object literal would not, and the
// stale-plan bug this file guards is only visible once a refetch can move the UI.
vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: () => {
    React.useSyncExternalStore(
      billingMocks.subscribe,
      () => testState.billingVersion,
      () => testState.billingVersion,
    );
    return { data: testState.billing, isLoading: false, refetch: billingMocks.refetch };
  },
}));
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) => selector(testState.account),
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children?: React.ReactNode }) => <article>{children}</article>,
}));
vi.mock('@/features/marketing/components/WaitlistModal', () => ({
  WaitlistTrigger: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock('../byok/WaitlistForm', () => ({ WaitlistForm: () => <div /> }));

import PricingPage from './page';

async function showTeamAndEnterprise() {
  fireEvent.click(await screen.findByRole('button', { name: 'audienceBusiness' }));
}

/**
 * Max 5x and Max 15x share one card behind a capacity selector, so only the
 * selected variant's price and CTA are mounted at a time. Anything asserting on
 * the 15x price ($200) or its CTA has to pick the variant first.
 */
async function showMax15x() {
  const selector = await screen.findByRole('group', { name: 'maxVariantLabel' });
  fireEvent.click(within(selector).getByRole('button', { name: 'Max 15x' }));
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/pricing');
    testState.auth.user = null;
    testState.auth.initialized = true;
    testState.billing = null;
    testState.billingVersion += 1;
    billingMocks.refetch.mockImplementation(async () => ({ data: testState.billing }));
    testState.account.subscription = null;
    testState.account.initialized = true;
    testState.account.isLoading = false;
    testState.account.error = null;
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  });

  it('does not flash purchase controls before account identity is known', () => {
    testState.auth.initialized = false;

    render(<PricingPage />);

    expect(screen.getAllByRole('button', { name: 'Checking account…' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'basicCta' })).toBeNull();
  });

  it('renders every public plan from the shared catalog, including Basic and both Max tiers', async () => {
    render(<PricingPage />);

    await waitFor(() => expect(screen.getAllByText('Basic').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Max 5x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Max 15x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$7').length).toBeGreaterThan(0);
    // Max 5x and Max 15x share a card, so only the selected capacity's price is
    // mounted: assert $100, switch, then assert $200.
    expect(screen.getAllByText('$100').length).toBeGreaterThan(0);
    await showMax15x();
    expect(screen.getAllByText('$200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('custom').length).toBeGreaterThan(0);
    // Team is a real per-seat plan: its $25/seat unit price renders in the Team
    // card (alongside a "per seat" sub), so the unit amount is expected here.
    expect(screen.getAllByText('$25/seat/mo').length).toBeGreaterThan(0);
  });

  it('offers Team as a real per-seat checkout instead of a sales hand-off', async () => {
    render(<PricingPage />);

    // The contact-sales dead end is gone for Team; Enterprise keeps it. Both
    // cards live on the Team & Enterprise tab, so activate it before looking.
    await showTeamAndEnterprise();

    const salesLinks = await screen.findAllByRole('link', { name: /Cta$/ });
    expect(
      salesLinks.some((link) => link.getAttribute('href') === '/contact-sales?plan=team'),
    ).toBe(false);
    expect(salesLinks.some((link) => link.getAttribute('href') === '/contact-sales')).toBe(true);

    expect(screen.getByRole('button', { name: 'teamCta' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'seatCountLabel' })).toBeInTheDocument();
  });

  it('reveals the Team seat selector when a Team CTA links to its pricing anchor', async () => {
    window.history.replaceState(null, '', '/pricing#pricing-team-title');

    render(<PricingPage />);

    expect(await screen.findByRole('button', { name: 'audienceBusiness' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('spinbutton', { name: 'seatCountLabel' })).toHaveValue(
      MIN_PURCHASABLE_SEATS,
    );
  });

  it('makes the prominent Team total track the canonical per-seat price at multiple quantities', async () => {
    render(<PricingPage />);
    await showTeamAndEnterprise();

    const teamCard = screen.getByRole('heading', { name: 'Team' }).closest('article');
    expect(teamCard).not.toBeNull();
    const card = within(teamCard!);
    expect(card.getByText('$50')).toBeVisible();
    expect(card.getByText('2 seats · billed monthly')).toBeVisible();
    expect(card.getByText('$25/seat/mo')).toBeVisible();

    fireEvent.change(card.getByRole('spinbutton', { name: 'seatCountLabel' }), {
      target: { value: '7' },
    });

    expect(card.getByText('$175')).toBeVisible();
    expect(card.getByText('7 seats · billed monthly')).toBeVisible();
    expect(card.getByText('$25/seat/mo')).toBeVisible();
  });

  it('prefills Team seat management from the licensed-seat link state', async () => {
    window.history.replaceState(null, '', '/pricing?seats=5#pricing-team-title');

    render(<PricingPage />);

    expect(await screen.findByRole('spinbutton', { name: 'seatCountLabel' })).toHaveValue(5);
    expect(screen.getByText('$125')).toBeVisible();
  });

  it('sends the chosen seat count to Team checkout', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: 'usd',
        plans: {
          basic: {},
          pro: {},
          max: {},
          max_15x: {},
          team: {
            monthly: {
              amountMinor: 2_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);

    await showTeamAndEnterprise();
    const seatInput = await screen.findByRole('spinbutton', { name: 'seatCountLabel' });
    fireEvent.change(seatInput, { target: { value: '14' } });

    expect(screen.getByText('$280')).toBeVisible();
    expect(screen.getByText('14 seats · billed monthly')).toBeVisible();

    const teamCta = screen.getByRole('button', { name: 'teamCta' });
    await waitFor(() => expect(teamCta).toBeEnabled());
    fireEvent.click(teamCta);

    await waitFor(() => expect(stripeMocks.upgradeToTeamPlan).toHaveBeenCalledWith({ seats: 14 }));
  });

  it('preserves the chosen Team seats through signed-out authentication', async () => {
    render(<PricingPage />);

    await showTeamAndEnterprise();
    const seatInput = await screen.findByRole('spinbutton', { name: 'seatCountLabel' });
    fireEvent.change(seatInput, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'teamCta' }));

    expect(routerMocks.push).toHaveBeenCalledWith(
      '/login?redirectTo=%2Fpricing%3Fseats%3D3%23pricing-team-title',
    );
  });

  it('offers a Team yearly cadence and sends billingPeriod yearly when the yearly Price is ready', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: 'usd',
        plans: {
          basic: {},
          pro: {},
          max: {},
          max_15x: {},
          team: {
            monthly: { amountMinor: 2_500, currency: 'usd', localized: false, checkoutReady: true },
            yearly: { amountMinor: 24_000, currency: 'usd', localized: false, checkoutReady: true },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);

    // The Team card exposes its own monthly/yearly cadence, separate from the
    // individual-plan annual toggle.
    await showTeamAndEnterprise();
    const teamCadence = await screen.findByRole('group', { name: 'Team billing cadence' });
    fireEvent.click(within(teamCadence).getByRole('button', { name: /annual/i }));

    expect(screen.getByText('$480')).toBeVisible();
    expect(screen.getByText('2 seats · billed annually')).toBeVisible();
    // The annual seat price is shown per month so the cadence toggle compares
    // like with like against $25/seat/mo; the charge is still $240 a year,
    // which the cadence line states.
    expect(screen.getByText('$20/seat/mo')).toBeVisible();

    const teamCta = screen.getByRole('button', { name: 'teamCta' });
    await waitFor(() => expect(teamCta).toBeEnabled());
    fireEvent.click(teamCta);

    await waitFor(() =>
      expect(stripeMocks.upgradeToTeamPlan).toHaveBeenCalledWith({
        seats: MIN_PURCHASABLE_SEATS,
        billingPeriod: 'yearly',
      }),
    );
  });

  it('does not offer a Team yearly cadence when the yearly Price is not checkout-ready (fail-closed)', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: 'usd',
        plans: {
          basic: {},
          pro: {},
          max: {},
          max_15x: {},
          team: {
            monthly: { amountMinor: 2_500, currency: 'usd', localized: false, checkoutReady: true },
            // Present but not checkout-ready (e.g. STRIPE_PRICE_TEAM_YEARLY_USD unset).
            yearly: {
              amountMinor: 24_000,
              currency: 'usd',
              localized: false,
              checkoutReady: false,
            },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);

    await showTeamAndEnterprise();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'teamCta' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('group', { name: 'Team billing cadence' })).toBeNull();
  });

  it('clamps a seat count below the minimum instead of sending it to checkout', async () => {
    render(<PricingPage />);

    await showTeamAndEnterprise();
    const seatInput = await screen.findByRole('spinbutton', { name: 'seatCountLabel' });
    // The floor is 2 since 2026-08-08; a one-person Team belongs on Pro.
    fireEvent.change(seatInput, { target: { value: '0' } });
    expect(seatInput).toHaveValue(MIN_PURCHASABLE_SEATS);

    fireEvent.change(seatInput, { target: { value: '-5' } });
    expect(seatInput).toHaveValue(MIN_PURCHASABLE_SEATS);

    fireEvent.change(seatInput, { target: { value: '1' } });
    expect(seatInput).toHaveValue(MIN_PURCHASABLE_SEATS);
  });

  it('shows the enforceable project, MCP, media, and developer-surface plan differences', async () => {
    render(<PricingPage />);

    const comparison = screen.getByRole('table', { name: 'Plan capabilities' });
    const rows = within(comparison);
    expect(rows.getByRole('row', { name: /^Free / })).toHaveAccessibleName(
      'Free free foreverLabel compareFreeUsage 1 project 1 custom MCP Yes No No No No No managed access No No compareFreeBestFor',
    );
    expect(rows.getByRole('row', { name: /^Basic / })).toHaveAccessibleName(
      'Basic $7/mo monthly compareBasicUsage 5 projects 5 custom MCP Yes No No No No No managed access No No compareBasicBestFor',
    );
    expect(rows.getByRole('row', { name: /^Pro / })).toHaveAccessibleName(
      'Pro $20/mo compareProInterval $16.67 compareProUsage 25 projects 25 custom MCP Yes Yes Yes No Yes CLI, Chrome & VS Code No No compareProBestFor',
    );
    expect(rows.getByRole('row', { name: /^Max 5x / })).toHaveAccessibleName(
      'Max 5x $100/mo monthlyOnly compareMaxUsage Unlimited Unlimited Yes Yes Yes No Yes CLI, Chrome & VS Code No No compareMaxBestFor',
    );
    expect(rows.getByRole('row', { name: /^Max 15x / })).toHaveAccessibleName(
      'Max 15x $200/mo monthlyOnly 15x Pro usage Unlimited Unlimited Yes Yes Yes Yes Yes CLI, Chrome & VS Code No No Highest-capacity work and video generation',
    );
    expect(rows.getByRole('row', { name: /^Team / })).toHaveAccessibleName(
      'Team $25/seat/mo compareTeamBilling compareTeamUsage 25 projects 25 custom MCP Yes Yes Yes No Yes CLI, Chrome & VS Code Yes No compareTeamBestFor',
    );
    // Explicit timeout: this assertion computes the accessible name of every row
    // in the full comparison table, which is genuinely slow in jsdom and sits
    // close to the 5s default even before machine load. Raising it here keeps
    // the failure mode "assertion failed", not "flaky timeout".
  }, 30_000);

  it('renders trusted regional prices without exposing India pricing to other regions', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'IN',
        requestedCurrency: 'inr',
        plans: {
          basic: {
            monthly: {
              amountMinor: 39_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          pro: {
            monthly: {
              amountMinor: 199_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          max: {
            monthly: {
              amountMinor: 999_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          max_15x: {
            monthly: {
              amountMinor: 2_499_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          team: {},
        },
      }),
    } as Response);

    render(<PricingPage />);

    await waitFor(() => expect(screen.getAllByText('₹399').length).toBeGreaterThan(0));
    expect(screen.getAllByText('₹1,999').length).toBeGreaterThan(0);
    // One Max capacity is mounted at a time, so the 15x rupee price is only
    // assertable after switching the selector.
    expect(screen.getAllByText('₹9,999').length).toBeGreaterThan(0);
    await showMax15x();
    expect(screen.getAllByText('₹24,999').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /INR/i })).not.toBeInTheDocument();
  });

  it('sends an active paid subscriber to the order screen instead of charging from the card', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'pro', status: 'active' };
    testState.account.subscription = {
      tier: 'pro',
      status: 'active',
      subscription_source: 'stripe',
    };

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'maxCta' }));

    // A mid-cycle upgrade bills the saved card with no Stripe screen in the way,
    // so the pricing card must not be able to start one. /upgrade/max is where
    // the proration is priced, the payment method named and assent taken.
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith('/upgrade/max'));
    expect(stripeMocks.upgradePlanMidCycle).not.toHaveBeenCalled();
    expect(stripeMocks.upgradeToMaxPlan).not.toHaveBeenCalled();
  });

  it('carries the yearly choice to the order screen so it does not price monthly', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'basic', status: 'active' };
    testState.account.subscription = {
      tier: 'basic',
      status: 'active',
      subscription_source: 'stripe',
    };

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: /annual/i }));
    fireEvent.click(screen.getByRole('button', { name: 'proCta' }));

    await waitFor(() =>
      expect(routerMocks.push).toHaveBeenCalledWith('/upgrade/pro?interval=yearly'),
    );
  });

  it('keeps refetching after confirm until the webhook has actually moved the plan', async () => {
    // Team still confirms in-page, because its price depends on a seat count
    // chosen here. /api/upgrade answers `webhook_pending`: Stripe has charged,
    // but plan_tier is only written when customer.subscription.updated lands, so
    // a single refetch on confirm re-reads the OLD plan.
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'pro', status: 'active' };
    testState.account.subscription = {
      tier: 'pro',
      status: 'active',
      subscription_source: 'stripe',
    };
    stripeMocks.previewUpgrade.mockResolvedValueOnce({
      amountDueNowCents: 4200,
      currency: 'usd',
      previewToken: 'signed-preview-token',
    });
    stripeMocks.upgradePlanMidCycle.mockResolvedValueOnce({ activation: 'webhook_pending' });

    let polls = 0;
    billingMocks.refetch.mockImplementation(async () => {
      polls += 1;
      if (polls > 1) {
        testState.billing = { plan: 'team', status: 'active' };
        testState.billingVersion += 1;
        billingMocks.emit();
      }
      return { data: testState.billing };
    });

    render(<PricingPage />);
    await showTeamAndEnterprise();
    fireEvent.click(screen.getByRole('button', { name: 'teamCta' }));

    const confirmBtn = await screen.findByRole('button', { name: /confirm/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(stripeMocks.upgradePlanMidCycle).toHaveBeenCalled());
    // One refetch was not enough; the page only stops offering Team once a later
    // poll reads the plan the user has already paid for.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'teamCta' })).toBeNull(), {
      timeout: 10_000,
    });
    expect(billingMocks.refetch.mock.calls.length).toBeGreaterThan(1);
  }, 15_000);

  it.each([
    ['apple', 'Manage with Apple'],
    ['google', 'Manage with Google Play'],
    ['manual', 'Contact administrator'],
    [undefined, 'Review billing'],
  ] as const)(
    'routes an active %s-owned plan to its billing owner instead of a Stripe preview',
    async (source, actionLabel) => {
      testState.auth.user = { id: 'user-1', email: 'user@example.com' };
      testState.billing = { plan: 'pro', status: 'active' };
      testState.account.subscription = {
        tier: 'pro',
        status: 'active',
        ...(source ? { subscription_source: source } : {}),
      };

      render(<PricingPage />);

      const ownerAction = screen.getByRole('link', { name: actionLabel });
      expect(ownerAction).toHaveAttribute('href', '/settings/billing');
      expect(screen.queryByRole('button', { name: 'maxCta' })).toBeNull();
      expect(stripeMocks.previewUpgrade).not.toHaveBeenCalled();
    },
  );

  it('prevents active subscribers from purchasing their current or a lower plan', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'pro', status: 'active' };
    testState.account.subscription = {
      tier: 'pro',
      status: 'active',
      subscription_source: 'stripe',
    };

    render(<PricingPage />);

    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();

    const manageBilling = screen.getByRole('button', { name: 'Manage billing' });
    expect(manageBilling).not.toHaveAttribute('href');
    fireEvent.click(manageBilling);
    await waitFor(() => expect(stripeMocks.openBillingPortal).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'basicCta' })).toBeNull();
    expect(screen.getByRole('button', { name: 'maxCta' })).toBeEnabled();
    await showMax15x();
    expect(screen.getByRole('button', { name: 'max15xCta' })).toBeEnabled();
    // Team is a different product, not a rung on the individual ladder: a Pro
    // subscriber can still buy it (as a seat-carrying org plan).
    await showTeamAndEnterprise();
    expect(screen.getByRole('button', { name: 'teamCta' })).toBeInTheDocument();
  });

  it('routes a Team subscriber to seat changes, not to an individual upgrade', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'team', status: 'active' };
    testState.account.subscription = {
      tier: 'team',
      status: 'active',
      subscription_source: 'stripe',
    };

    render(<PricingPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Manage billing' }).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('button', { name: 'maxCta' })).toBeNull();

    // Not "Current plan": a growing org's actionable change is more seats.
    await showTeamAndEnterprise();
    expect(screen.getByRole('button', { name: 'changeSeatsCta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'teamCta' })).toBeNull();
  });

  it('keeps paid checkout disabled until trusted localized prices are ready', () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    render(<PricingPage />);

    expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled();
    expect(screen.getByText('Loading checkout availability…')).toBeTruthy();
  });

  it('disables only plans whose trusted localized checkout price is unavailable', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: 'usd',
        plans: {
          basic: {
            monthly: {
              amountMinor: 700,
              currency: 'usd',
              localized: false,
              checkoutReady: false,
            },
          },
          pro: {
            monthly: {
              amountMinor: 2_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 20_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          max: {
            monthly: {
              amountMinor: 10_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          max_15x: {
            monthly: {
              amountMinor: 20_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          team: {
            monthly: {
              amountMinor: 2_500,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 24_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'proCta' })).toBeEnabled();
    expect(screen.getByText('Basic checkout is not available in your region yet.')).toBeTruthy();
  });

  it('keeps checkout disabled when regional pricing verification fails', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network unavailable'));

    render(<PricingPage />);

    expect(
      await screen.findByText(
        'Checkout availability could not be verified. Refresh this page to try again.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled();
  });

  it('uses localized annual Pro pricing while keeping Team custom', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'GB',
        requestedCurrency: 'gbp',
        plans: {
          basic: {},
          pro: {
            monthly: {
              amountMinor: 1_800,
              currency: 'gbp',
              localized: true,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 18_000,
              currency: 'gbp',
              localized: true,
              checkoutReady: true,
            },
          },
          max: {},
          max_15x: {},
          team: {
            monthly: {
              amountMinor: 1_800,
              currency: 'gbp',
              localized: true,
              checkoutReady: true,
            },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: /annual/i }));

    await waitFor(() => expect(screen.getAllByText('£15').length).toBeGreaterThan(0));
    expect(screen.getByRole('row', { name: /^Pro / })).toHaveTextContent('£15');
    // Team is per seat and monthly-only: the annual toggle must not divide its
    // per-seat price by twelve the way it does Pro's yearly price.
    expect(screen.getByRole('row', { name: /^Team / })).toHaveTextContent('£18/seat/mo');
    expect(screen.getAllByText('£18/seat/mo').length).toBeGreaterThan(0);
  });

  it('does not render the obsolete managed-cloud early-access waitlist', () => {
    render(<PricingPage />);

    expect(screen.queryByText('waitlistHeading')).toBeNull();
    expect(screen.queryByText('requestHostedAccessCta')).toBeNull();
  });

  it('links to the FAQ for billing and plan questions', () => {
    render(<PricingPage />);

    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
  });
});
