import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { MIN_PURCHASABLE_SEATS } from '@agiworkforce/types';
import { SURFACE_NAMES, SURFACE_STATUS } from '@/lib/surface-status';

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

type ReactI18nextModule = typeof import('react-i18next');

vi.mock('next/navigation', () => ({ useRouter: () => routerMocks }));
vi.mock('react-i18next', async (importOriginal) => {
  const { createInstance } = await import('i18next');
  const { resources } = await import('@agiworkforce/i18n');
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: false,
    resources,
    ns: ['pricing', 'models'],
    defaultNS: 'pricing',
    interpolation: { escapeValue: false },
  });
  const translated = instance.getFixedT('en', 'pricing');
  return {
    ...(await importOriginal<ReactI18nextModule>()),
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) => {
        if (
          key === 'surfaceAvailableNow' ||
          key === 'models:selector.comingSoon' ||
          key === 'compareLocalDeveloperSurfaces' ||
          key === 'compareByokDeveloperSurfaces' ||
          key === 'compareManagedDeveloperSurfaces' ||
          key === 'freeLocalByok'
        ) {
          if (!instance.exists(key))
            throw new Error(`Missing pricing availability translation: ${key}`);
          return translated(key, values);
        }
        if (key === 'seatTotal') {
          return `Seats: ${String(values?.['seats'])} · ${String(values?.['total'])}/mo`;
        }
        if (key === 'seatTotalAnnual') {
          return `Seats: ${String(values?.['seats'])} · ${String(values?.['total'])}/yr`;
        }
        if (key === 'perSeatPrice') return `${String(values?.['price'])}/seat/mo`;
        if (key === 'usageMultiplierAll') {
          return `${String(values?.['factor'])}x more usage than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageMultiplierSession') {
          return `${String(values?.['factor'])}x more usage per session than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageMultiplierWeekly') {
          return `${String(values?.['factor'])}x more weekly usage than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageSameAsPerSeat') {
          return `Same usage as ${String(values?.['baseline'])} for every seat`;
        }
        if (key === 'compareTeamPriceYearly') {
          return `${String(values?.['yearly'])}/seat/mo billed yearly, ${String(values?.['monthly'])} billed monthly`;
        }
        if (key === 'compareTableHint') {
          return `${String(values?.['plans'])} plans across ${String(values?.['capabilities'])} capabilities`;
        }
        return key;
      },
    }),
  };
});
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
vi.mock('@features/billing/components/DowngradeReviewDialog', () => ({
  DowngradeReviewDialog: ({ open, initialPlan }: { open: boolean; initialPlan: string | null }) =>
    open ? <div>{`Downgrade review for ${initialPlan}`}</div> : null,
}));
vi.mock('@features/billing/components/UpgradeWaitlistDialog', () => ({
  UpgradeWaitlistDialog: ({
    request,
    onAccessGranted,
  }: {
    request: { plan: string; billingInterval: string; seats?: number } | null;
    onAccessGranted: (request: {
      plan: string;
      billingInterval: string;
      seats?: number;
    }) => Promise<void>;
  }) =>
    request ? (
      <div>
        <span>{`Waitlist for ${request.plan}`}</span>
        <button onClick={() => void onAccessGranted(request)}>Continue with code</button>
      </div>
    ) : null,
}));

import PricingPage from './page';

/**
 * Team and Enterprise moved behind an audience tab on 2026-08-08 so the page
 * shows four cards at a time instead of nine. The panel keeps `hidden` while
 * inactive, which drops it out of the accessibility tree, text queries still
 * match, but every `getByRole` for a Team control needs the tab activated
 * first. This is that click.
 */
async function showTeamAndEnterprise() {
  fireEvent.click(await screen.findByRole('button', { name: 'audienceBusiness' }));
}

/**
 * Max 5x and Max 20x share one card behind a capacity selector, so only the
 * selected variant's price and CTA are mounted at a time. Anything asserting on
 * the 20x price ($200) or its CTA has to pick the variant first.
 */
async function showMax20x() {
  const selector = await screen.findByRole('group', { name: 'maxVariantLabel' });
  fireEvent.click(within(selector).getByRole('button', { name: 'Max 20x' }));
}

const TEAM_BOTH_CADENCES = {
  monthly: { amountMinor: 2_500, currency: 'usd', localized: false, checkoutReady: true },
  yearly: { amountMinor: 24_000, currency: 'usd', localized: false, checkoutReady: true },
};

function mockPricingFetch(
  team: Record<string, unknown>,
  subscription?: { plan: string; interval: 'monthly' | 'yearly' },
) {
  vi.mocked(global.fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/api/pricing/localized')) {
      return {
        ok: true,
        json: async () => ({
          country: 'US',
          requestedCurrency: 'usd',
          plans: { basic: {}, pro: {}, max: {}, max_15x: {}, team },
        }),
      } as Response;
    }
    if (url.includes('/api/billing/downgrade-preview') && subscription) {
      return {
        ok: true,
        json: async () => ({
          plan: subscription.plan,
          status: 'active',
          price: { amountCents: 2_500, currency: 'usd', interval: subscription.interval },
          periodEnd: '2027-01-01T00:00:00.000Z',
          trialStart: null,
          trialEnd: null,
          cancelAt: null,
          scheduledChange: null,
          downgradeTargets: [],
          downgradeBlock: null,
          cadenceSwitch: null,
        }),
      } as Response;
    }
    return new Promise<Response>(() => undefined);
  });
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
    expect(screen.getAllByText('Max 20x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$7').length).toBeGreaterThan(0);
    // Max 5x and Max 20x share a card, so only the selected capacity's price is
    // mounted: assert $100, switch, then assert $200.
    expect(screen.getAllByText('$100').length).toBeGreaterThan(0);
    await showMax20x();
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

  it('leads the Team card with the per-seat price and totals the chosen seats beside the picker', async () => {
    render(<PricingPage />);
    await showTeamAndEnterprise();

    const teamCard = screen.getByRole('heading', { name: 'Team' }).closest('article');
    expect(teamCard).not.toBeNull();
    const card = within(teamCard!);
    expect(card.getByText('$25')).toBeVisible();
    expect(card.getByText('perSeatPricingSub')).toBeVisible();
    expect(card.getByText('billedMonthly')).toBeVisible();
    expect(card.getByText('Seats: 2 · $50/mo')).toBeVisible();

    fireEvent.change(card.getByRole('spinbutton', { name: 'seatCountLabel' }), {
      target: { value: '7' },
    });

    expect(card.getByText('$25')).toBeVisible();
    expect(card.getByText('Seats: 7 · $175/mo')).toBeVisible();
    expect(card.queryByText('$175')).toBeNull();
  });

  it('prefills Team seat management from the licensed-seat link state', async () => {
    window.history.replaceState(null, '', '/pricing?seats=5#pricing-team-title');

    render(<PricingPage />);

    expect(await screen.findByRole('spinbutton', { name: 'seatCountLabel' })).toHaveValue(5);
    expect(screen.getByText('Seats: 5 · $125/mo')).toBeVisible();
  });

  it('preserves the chosen Team seat count after waitlist-code access', async () => {
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

    expect(await screen.findByText('Seats: 14 · $280/mo')).toBeVisible();

    const teamCta = screen.getByRole('button', { name: 'teamCta' });
    await waitFor(() => expect(teamCta).toBeEnabled());
    fireEvent.click(teamCta);

    expect(await screen.findByText('Waitlist for team')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

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

  it('opens Team on yearly billing, priced per seat per month, and keeps that cadence after waitlist-code access', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    mockPricingFetch(TEAM_BOTH_CADENCES);

    render(<PricingPage />);

    await showTeamAndEnterprise();
    const teamCadence = await screen.findByRole('group', { name: 'Team billing cadence' });
    expect(within(teamCadence).getByRole('button', { name: /annual/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const card = within(screen.getByRole('heading', { name: 'Team' }).closest('article')!);
    expect(card.getByText('$20')).toBeVisible();
    expect(card.getByText('perSeatPricingSub')).toBeVisible();
    expect(card.getByText('billedYearly')).toBeVisible();
    expect(card.getByText('$20').closest('.agi-tier-price')!.textContent).toBe(
      '$20 perSeatPricingSub billedYearly annualSave',
    );
    expect(card.getByText('Seats: 2 · $480/yr')).toBeVisible();
    expect(card.queryByText('$240')).toBeNull();
    expect(card.queryByText('$480')).toBeNull();

    const teamCta = screen.getByRole('button', { name: 'teamCta' });
    await waitFor(() => expect(teamCta).toBeEnabled());
    fireEvent.click(teamCta);

    expect(await screen.findByText('Waitlist for team')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    await waitFor(() =>
      expect(stripeMocks.upgradeToTeamPlan).toHaveBeenCalledWith({
        seats: MIN_PURCHASABLE_SEATS,
        billingPeriod: 'yearly',
      }),
    );
  });

  it('shows the monthly seat price billed monthly once Team is switched to monthly', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    mockPricingFetch(TEAM_BOTH_CADENCES);

    render(<PricingPage />);

    await showTeamAndEnterprise();
    const teamCadence = await screen.findByRole('group', { name: 'Team billing cadence' });
    fireEvent.click(within(teamCadence).getByRole('button', { name: 'monthly' }));

    const card = within(screen.getByRole('heading', { name: 'Team' }).closest('article')!);
    expect(card.getByText('$25')).toBeVisible();
    expect(card.getByText('perSeatPricingSub')).toBeVisible();
    expect(card.getByText('billedMonthly')).toBeVisible();
    expect(card.getByText('Seats: 2 · $50/mo')).toBeVisible();

    const teamCta = screen.getByRole('button', { name: 'teamCta' });
    await waitFor(() => expect(teamCta).toBeEnabled());
    fireEvent.click(teamCta);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with code' }));

    await waitFor(() =>
      expect(stripeMocks.upgradeToTeamPlan).toHaveBeenCalledWith({ seats: MIN_PURCHASABLE_SEATS }),
    );
  });

  it.each([
    ['pro', 'monthly', 'false'],
    ['team', 'yearly', 'true'],
  ] as const)(
    'opens Team on the %s subscriber’s own %s cadence, which a mid-cycle change must keep',
    async (plan, interval, annualPressed) => {
      testState.auth.user = { id: 'user-1', email: 'user@example.com' };
      testState.billing = { plan, status: 'active' };
      testState.account.subscription = {
        tier: plan,
        status: 'active',
        subscription_source: 'stripe',
      };
      mockPricingFetch(TEAM_BOTH_CADENCES, { plan, interval });

      render(<PricingPage />);

      await showTeamAndEnterprise();
      const teamCadence = await screen.findByRole('group', { name: 'Team billing cadence' });
      await waitFor(() =>
        expect(within(teamCadence).getByRole('button', { name: /annual/i })).toHaveAttribute(
          'aria-pressed',
          annualPressed,
        ),
      );
    },
  );

  it('prices the Team comparison row at both cadences when yearly Team is sold', async () => {
    mockPricingFetch(TEAM_BOTH_CADENCES);

    render(<PricingPage />);

    const row = await screen.findByRole('row', { name: /^Team / });
    await waitFor(() =>
      expect(row).toHaveTextContent('$20/seat/mo billed yearly, $25 billed monthly'),
    );
    expect(row).toHaveTextContent('compareTeamBillingYearly');
  }, 30_000);

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
    const developerEntitlement = `Yes · ${SURFACE_NAMES.cli}: ${SURFACE_STATUS.cli}; ${SURFACE_NAMES.vscode}: ${SURFACE_STATUS.vscode}`;
    expect(rows.getByRole('row', { name: /^Free / })).toHaveAccessibleName(
      'Free free foreverLabel compareFreeUsage Not by AGI. Free model providers may. No No Up to 200K tokens Yes 1 project 1 custom MCP Yes No No No No No No compareFreeBestFor',
    );
    expect(rows.getByRole('row', { name: /^Basic / })).toHaveAccessibleName(
      'Basic $7/mo monthlyOnly 5x more usage per session than Free No No No Up to 1.05M tokens Yes 5 projects 5 custom MCP Yes No No No No No No compareBasicBestFor',
    );
    expect(rows.getByRole('row', { name: /^Pro / })).toHaveAccessibleName(
      `Pro $20/mo monthlyOnly 5x more usage than Basic No No No Up to 1.05M tokens Yes 25 projects 25 custom MCP Yes Yes Yes Yes No Yes ${developerEntitlement} compareProBestFor`,
    );
    expect(rows.getByRole('row', { name: /^Max 5x / })).toHaveAccessibleName(
      `Max 5x $100/mo monthlyOnly 5x more usage than Pro No No No Up to 1.05M tokens Yes Unlimited Unlimited Yes Yes Yes Yes No Yes ${developerEntitlement} compareMaxBestFor`,
    );
    expect(rows.getByRole('row', { name: /^Max 20x / })).toHaveAccessibleName(
      `Max 20x $200/mo monthlyOnly 20x more usage per session than Pro · 10x more weekly usage than Pro No No No Up to 1.05M tokens Yes Unlimited Unlimited Yes Yes Yes Yes Yes Yes ${developerEntitlement} Highest-capacity work and video generation`,
    );
    expect(rows.getByRole('row', { name: /^Team / })).toHaveAccessibleName(
      `Team $25/seat/mo compareTeamBilling Same usage as Pro for every seat No Yes No Up to 1.05M tokens Yes 25 projects 25 custom MCP Yes Yes Yes Yes No Yes ${developerEntitlement} compareTeamBestFor`,
    );
    // Explicit timeout: this assertion computes the accessible name of every row
    // in the full comparison table, which is genuinely slow in jsdom and sits
    // close to the 5s default even before machine load. Raising it here keeps
    // the failure mode "assertion failed", not "flaky timeout".
  }, 30_000);

  it('uses identical qualified developer-surface cells in the desktop table and plan stack', () => {
    render(<PricingPage />);
    const table = screen.getByRole('table', { name: 'Plan capabilities' });
    const tableQueries = within(table);
    const headers = tableQueries.getAllByRole('columnheader');
    const column = headers.findIndex((header) =>
      header.textContent?.includes('Managed Cloud in the CLI and VS Code'),
    );
    expect(column).toBeGreaterThan(0);
    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    const stack = select.closest('.agi-compare-stack');
    expect(stack).not.toBeNull();
    const options = within(select).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const plan = option.getAttribute('value');
      const label = option.textContent;
      expect(plan).toBeTruthy();
      expect(label).toBeTruthy();
      fireEvent.change(select, { target: { value: plan } });
      const list = within(stack as HTMLElement).getByLabelText(label!);
      expect(list.tagName).toBe('DL');
      const pair = [...list.querySelectorAll('dt')].find(
        (term) => term.textContent === headers[column]!.textContent,
      );
      expect(pair).toBeDefined();
      const stackValue = pair!.nextElementSibling?.textContent;
      const row = tableQueries
        .getAllByRole('row')
        .find((candidate) => within(candidate).queryByRole('rowheader')?.textContent === label);
      expect(row).toBeDefined();
      const tableValue = within(row!).getAllByRole('cell')[column - 1]!.textContent;
      expect(stackValue).toBe(tableValue);
      if (tableValue?.startsWith('Yes')) {
        expect(tableValue).toContain(`${SURFACE_NAMES.cli}: ${SURFACE_STATUS.cli}`);
        expect(tableValue).toContain(`${SURFACE_NAMES.vscode}: ${SURFACE_STATUS.vscode}`);
      }
    }
  });

  it('lists Deep Research as a comparison column derived from the plan catalog', () => {
    render(<PricingPage />);

    const comparison = within(screen.getByRole('table', { name: 'Plan capabilities' }));
    const headers = comparison.getAllByRole('columnheader');
    const column = headers.findIndex((header) => header.textContent === 'Deep Research');
    expect(column).toBeGreaterThan(-1);

    const expected: Record<string, string> = {
      Free: 'No',
      Basic: 'No',
      Pro: 'Yes',
      'Max 5x': 'Yes',
      'Max 20x': 'Yes',
      Team: 'Yes',
    };
    const bodyRows = comparison.getAllByRole('row').slice(1);
    for (const row of bodyRows) {
      const cells = [within(row).getByRole('rowheader'), ...within(row).getAllByRole('cell')];
      expect(cells).toHaveLength(headers.length);
      const plan = cells[0]?.textContent ?? '';
      if (plan in expected) expect(cells[column]?.textContent).toBe(expected[plan]);
    }
  }, 30_000);

  it('pins plan names as row headers inside a named, focusable scroll region', () => {
    render(<PricingPage />);

    const region = screen.getByRole('region', { name: 'Scrollable plan comparison' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('agi-compare-scroll');
    expect(region.parentElement?.parentElement).toHaveClass('agi-compare-disclosure');

    const comparison = within(within(region).getByRole('table', { name: 'Plan capabilities' }));
    const headers = comparison.getAllByRole('columnheader');
    const headerLabels = headers.map((header) => header.textContent);
    expect(headerLabels.slice(0, 7)).toEqual([
      'Plan',
      'Price',
      'Billing',
      'Managed usage',
      'Trains on your content',
      'Team administration',
      'SSO, SCIM and admin controls',
    ]);
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col');

    const bodyRows = comparison.getAllByRole('row').slice(1);
    expect(bodyRows.length).toBeGreaterThan(0);
    for (const row of bodyRows) {
      const rowHeaders = within(row).getAllByRole('rowheader');
      expect(rowHeaders).toHaveLength(1);
      expect(rowHeaders[0]).toHaveAttribute('scope', 'row');
      expect(rowHeaders[0]).toBe(row.firstElementChild);
      expect(rowHeaders[0]?.textContent?.trim()).not.toBe('');
    }

    const identity = new Set(['Plan', 'Price', 'Billing', 'Best for']);
    const capabilityCount = headerLabels.filter((label) => !identity.has(label ?? '')).length;
    expect(
      screen.getByText(`${bodyRows.length} plans across ${capabilityCount} capabilities`),
    ).toBeVisible();
    expect(screen.getByText('compareScrollCue')).toBeVisible();

    const models = within(screen.getByRole('table', { name: 'Model access by plan' }));
    for (const row of models.getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('rowheader')).toHaveLength(1);
    }
  }, 30_000);

  it('feeds the one-plan stack from the same rows and columns as the single comparison table', () => {
    render(<PricingPage />);

    const tables = screen.getAllByRole('table', { name: 'Plan capabilities' });
    expect(tables).toHaveLength(1);
    const table = within(tables[0] as HTMLElement);
    const valueHeaders = table
      .getAllByRole('columnheader')
      .slice(1)
      .map((header) => header.textContent);
    const bodyRows = table.getAllByRole('row').slice(1);

    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(bodyRows.map((row) => within(row).getByRole('rowheader').textContent));

    for (const row of bodyRows) {
      const plan = within(row).getByRole('rowheader').textContent ?? '';
      const option = within(select)
        .getAllByRole('option')
        .find((o) => o.textContent === plan) as HTMLOptionElement;
      fireEvent.change(select, { target: { value: option.value } });

      const list = select.closest('.agi-compare-stack')?.querySelector('dl') as HTMLElement;
      expect(list).toHaveAttribute('aria-label', plan);
      expect([...list.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(
        valueHeaders,
      );
      expect([...list.querySelectorAll('dd')].map((value) => value.textContent)).toEqual(
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    }
  }, 30_000);

  it('reveals the full table from the narrow view through a labelled disclosure button', () => {
    render(<PricingPage />);

    const views = screen
      .getByRole('combobox', { name: 'compareStackPlanLabel' })
      .closest('.agi-compare-views') as HTMLElement;
    const details = screen
      .getByRole('region', { name: 'Scrollable plan comparison' })
      .closest('details') as HTMLElement;
    expect(views).not.toHaveClass('agi-compare-views--table');
    expect(details).toHaveAttribute('id', 'pricing-compare-table');

    const toggle = screen.getByRole('button', { name: 'compareShowFullTable' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'pricing-compare-table');

    fireEvent.click(toggle);
    expect(views).toHaveClass('agi-compare-views--table');
    expect(screen.getByRole('button', { name: 'compareHideFullTable' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'compareHideFullTable' }));
    expect(views).not.toHaveClass('agi-compare-views--table');
    expect(screen.getByRole('button', { name: 'compareShowFullTable' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('returns focus to the visible table toggle and reopens after the native disclosure closes', () => {
    render(<PricingPage />);

    const details = screen
      .getByRole('region', { name: 'Scrollable plan comparison' })
      .closest('details') as HTMLDetailsElement;
    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    const views = select.closest('.agi-compare-views') as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'compareShowFullTable' });
    const toggleRect = new DOMRect(0, 0, 120, 44);
    vi.spyOn(toggle, 'getClientRects').mockReturnValue(
      Object.assign([toggleRect], { item: (index: number) => (index === 0 ? toggleRect : null) }),
    );
    expect(toggle.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    fireEvent.click(toggle);
    expect(details).toHaveAttribute('open');

    details.querySelector('summary')?.focus();
    details.open = false;
    fireEvent(details, new Event('toggle'));
    expect(toggle).toHaveFocus();
    expect(views).not.toHaveClass('agi-compare-views--table');
    expect(screen.getByRole('button', { name: 'compareShowFullTable' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'compareShowFullTable' }));
    expect(details).toHaveAttribute('open');
    expect(views).toHaveClass('agi-compare-views--table');
  });

  it('leaves focus on the native disclosure when the narrow-view toggle is hidden', () => {
    render(<PricingPage />);

    const details = screen
      .getByRole('region', { name: 'Scrollable plan comparison' })
      .closest('details') as HTMLDetailsElement;
    const summary = details.querySelector('summary')!;
    const toggle = screen.getByRole('button', { name: 'compareShowFullTable' });
    vi.spyOn(toggle, 'getClientRects').mockReturnValue(Object.assign([], { item: () => null }));

    summary.focus();
    details.open = false;
    fireEvent(details, new Event('toggle'));

    expect(summary).toHaveFocus();
  });

  describe('the limited free image and video preview', () => {
    function mockFreeMediaOffer(offer: unknown) {
      const read = vi.fn(async () => offer);
      vi.mocked(global.fetch).mockImplementation(async (input) => {
        if (String(input).includes('/api/models/free-quota/media-offer')) {
          return { ok: true, json: read } as unknown as Response;
        }
        return new Promise<Response>(() => undefined);
      });
      return async () => {
        await waitFor(() => expect(read).toHaveBeenCalled());
        await act(async () => undefined);
      };
    }

    function mediaCells(plan: RegExp): string[] {
      const comparison = screen.getByRole('table', { name: 'Plan capabilities' });
      const headers = within(comparison)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      const row = [...comparison.querySelectorAll('tbody tr')].find((candidate) =>
        plan.test(candidate.textContent ?? ''),
      )!;
      const cells = [...row.querySelectorAll('th, td')].map((cell) => cell.textContent ?? '');
      return ['Image generation', 'Video generation'].map(
        (column) => cells[headers.indexOf(column)]!,
      );
    }

    it('keeps every plan at Yes or No when the offer is not running', async () => {
      const offerRead = mockFreeMediaOffer({ image: null, video: null });
      render(<PricingPage />);

      await offerRead();
      expect(mediaCells(/^Free/)).toEqual(['No', 'No']);
      expect(mediaCells(/^Basic/)).toEqual(['No', 'No']);
      expect(mediaCells(/^Pro/)).toEqual(['Yes', 'No']);
      expect(mediaCells(/^Max 20x/)).toEqual(['Yes', 'Yes']);
      expect(screen.queryByText(/^freeMedia/)).toBeNull();
    });

    it('says Limited preview for plans without the capability while it runs, with no line under the page title', async () => {
      mockFreeMediaOffer({ image: { lastDay: '2026-10-20' }, video: { lastDay: '2026-11-04' } });
      render(<PricingPage />);

      await waitFor(() =>
        expect(mediaCells(/^Free/)).toEqual(['Limited preview', 'Limited preview']),
      );
      expect(mediaCells(/^Basic/)).toEqual(['Limited preview', 'Limited preview']);
      expect(mediaCells(/^Pro/)).toEqual(['Yes', 'Limited preview']);
      expect(mediaCells(/^Team/)).toEqual(['Yes', 'Limited preview']);
      expect(mediaCells(/^Max 20x/)).toEqual(['Yes', 'Yes']);
      expect(screen.queryByText(/^freeMediaLine/)).toBeNull();
      const freeCard = within(screen.getByRole('heading', { name: 'Free' }).closest('article')!);
      expect(freeCard.getByText('freeMediaFeatureBoth')).toBeVisible();
    });

    it('names only the kind that is ready', async () => {
      mockFreeMediaOffer({ image: { lastDay: '2026-10-20' }, video: null });
      render(<PricingPage />);

      await waitFor(() => expect(mediaCells(/^Free/)).toEqual(['Limited preview', 'No']));
      expect(mediaCells(/^Pro/)).toEqual(['Yes', 'No']);
      expect(screen.queryByText(/^freeMediaLine/)).toBeNull();
      expect(screen.getByText('freeMediaFeatureImage')).toBeVisible();
    });

    it('promises nothing when the answer is not the offer it expects', async () => {
      const offerRead = mockFreeMediaOffer({ image: { lastDay: 'soon' }, video: true });
      render(<PricingPage />);

      await offerRead();
      expect(mediaCells(/^Free/)).toEqual(['No', 'No']);
      expect(screen.queryByText(/^freeMedia/)).toBeNull();
    });
  });

  it('states each plan card’s usage relative to the plan below it, never as credit counts', async () => {
    render(<PricingPage />);

    const cardOf = (name: string) =>
      within(screen.getByRole('heading', { name }).closest('article')!);
    expect(cardOf('Basic').queryByText('5x more usage per session than Free')).toBeNull();
    expect(
      within(screen.getByRole('row', { name: /^Basic / })).getByText(
        '5x more usage per session than Free',
      ),
    ).toBeInTheDocument();
    expect(cardOf('Pro').getByText('5x more usage than Basic')).toBeVisible();
    expect(screen.getAllByText('5x more usage than Pro').length).toBeGreaterThan(0);
    await showMax20x();
    expect(screen.getAllByText('20x more usage per session than Pro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10x more weekly usage than Pro').length).toBeGreaterThan(0);
    expect(screen.getByText('usageWindowsExplainer flagshipShare')).toBeVisible();
    await showTeamAndEnterprise();
    expect(cardOf('Team').getByText('Same usage as Pro for every seat')).toBeVisible();

    expect(screen.queryByText(/credits per 5 hours|planCreditWindows/)).toBeNull();
  });

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
    // One Max capacity is mounted at a time, so the 20x rupee price is only
    // assertable after switching the selector.
    expect(screen.getAllByText('₹9,999').length).toBeGreaterThan(0);
    await showMax20x();
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

  it('sells individual plans monthly only, with no annual toggle beside them', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'basic', status: 'active' };
    testState.account.subscription = {
      tier: 'basic',
      status: 'active',
      subscription_source: 'stripe',
    };

    render(<PricingPage />);
    expect(screen.queryByRole('button', { name: /annual/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'proCta' }));

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith('/upgrade/pro'));
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
      // Still `pro` on the first read, the webhook has not landed yet.
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

      const ownerActions = screen.getAllByRole('link', { name: actionLabel });
      expect(ownerActions.length).toBeGreaterThan(0);
      for (const ownerAction of ownerActions) {
        expect(ownerAction).toHaveAttribute('href', '/settings/billing');
      }
      expect(screen.queryByRole('button', { name: 'maxCta' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'switchToPlanCta' })).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: 'switchToPlanCta' }));
    expect(await screen.findByText('Downgrade review for basic')).toBeVisible();
    expect(stripeMocks.upgradeToBasicPlan).not.toHaveBeenCalled();
    expect(stripeMocks.previewUpgrade).not.toHaveBeenCalled();
    expect(stripeMocks.openBillingPortal).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'basicCta' })).toBeNull();
    expect(screen.getByRole('button', { name: 'maxCta' })).toBeEnabled();
    await showMax20x();
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

    // Individual plans must NOT read as upgrades from an org plan, converting a
    // Team subscription into a personal one would strand the other seats. These
    // assertions belong on the individual tab, which is the default.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Manage billing' }).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('button', { name: 'maxCta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'switchToPlanCta' })).toBeNull();

    // Opens the Stripe portal rather than linking to /billing. The old href
    // closed a loop with no exit, /billing redirects to /settings/billing,
    // whose "Adjust plan" button is what sends the user to /pricing, so a
    // subscriber could never reach a control that actually changes the plan.
    const [manageBilling] = screen.getAllByRole('button', { name: 'Manage billing' });
    expect(manageBilling).not.toHaveAttribute('href');
    fireEvent.click(manageBilling!);
    await waitFor(() => expect(stripeMocks.openBillingPortal).toHaveBeenCalledTimes(1));

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

  it('uses localized monthly Pro pricing while keeping Team per seat', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'GB',
        requestedCurrency: 'gbp',
        plans: {
          basic: {},
          pro: {
            monthly: {
              amountMinor: 1_700,
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

    await waitFor(() => expect(screen.getAllByText('£17').length).toBeGreaterThan(0));
    expect(screen.getByRole('row', { name: /^Pro / })).toHaveTextContent('£17/mo');
    expect(screen.getByRole('row', { name: /^Team / })).toHaveTextContent('£18/seat/mo');
    expect(screen.getAllByText('£18/seat/mo').length).toBeGreaterThan(0);
  }, 30_000);

  it('does not render the obsolete managed-cloud access waitlist before an upgrade choice', () => {
    render(<PricingPage />);

    expect(screen.queryByText('waitlistHeading')).toBeNull();
    expect(screen.queryByText('requestHostedAccessCta')).toBeNull();
  });

  it('links to the FAQ for billing and plan questions', () => {
    render(<PricingPage />);

    expect(screen.getByRole('link', { name: 'Read the FAQ' })).toHaveAttribute('href', '/faq');
  });
});
