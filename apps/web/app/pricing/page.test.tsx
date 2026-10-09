import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  BILLING_PLAN_PRICING,
  MIN_PURCHASABLE_SEATS,
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  formatPrivacyModeLabel,
  getAllowedModelsForTier,
  getMinimumRequiredTier,
  getModelMetadataById,
  getPlanContextWindowTokens,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { SURFACE_NAMES, SURFACE_STATUS } from '@/lib/surface-status';
import {
  connectorFeatureNote,
  planCapabilityLabel,
} from '@/features/billing/lib/plan-capability-release';

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
          key === 'compareDeveloperSurfaceStatus' ||
          key === 'compareLocalByokNote' ||
          key === 'compareLimitedPreview' ||
          key === 'compareContextTokens' ||
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
        if (key === 'usageMultiplierAll') {
          return `${String(values?.['factor'])}x more usage than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageMultiplierSession') {
          return `${String(values?.['factor'])}x more usage per session than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageMultiplierWeekly') {
          return `${String(values?.['factor'])}x more weekly usage than ${String(values?.['baseline'])}`;
        }
        if (key === 'usageSameAs') {
          return `Same usage as ${String(values?.['baseline'])}`;
        }
        if (key === 'seatPremiumDescription') {
          return `${String(values?.['factor'])}x the usage of a Standard seat`;
        }
        if (key === 'seatPriceMonthlyAlternate' || key === 'seatPriceYearlyAlternate') {
          return `${key} ${String(values?.['price'])}`;
        }
        if (key === 'usageSameAsPerSeat') {
          return `Same usage as ${String(values?.['baseline'])} for every seat`;
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

function teamSeatRow(name: 'seatStandardName' | 'seatPremiumName') {
  const card = screen.getByRole('heading', { name: 'Team' }).closest('article')!;
  return within(within(card).getByRole('heading', { name }).closest('li')!);
}

function teamBillingLine(): string | null | undefined {
  return screen
    .getByRole('heading', { name: 'Team' })
    .closest('article')!
    .querySelector('.agi-tier-seat-billing')?.textContent;
}

const INCLUDED = 'Included';
const NOT_INCLUDED = 'Not included';
const CAPABILITY = Object.fromEntries(
  (Object.keys(BILLING_PLAN_CAPABILITY_LABELS) as BillingPlanCapability[]).map((capability) => [
    capability,
    planCapabilityLabel(capability),
  ]),
) as Record<BillingPlanCapability, string>;
const PLAN_ID_BY_LABEL = new Map<string, BillingPlanTier>(
  Object.values(BILLING_PLAN_PRICING).map((plan) => [plan.label, plan.id]),
);

interface ComparisonRowView {
  label: string;
  note: string;
  cells: Record<string, string>;
}

function comparisonValue(holder: Element | null | undefined): string {
  const value = holder?.querySelector('.agi-compare-value');
  if (!value) return '';
  if (value.classList.contains('agi-compare-value--included')) return INCLUDED;
  if (value.classList.contains('agi-compare-value--excluded')) return NOT_INCLUDED;
  return [...value.children].map((line) => line.textContent ?? '').join(' · ');
}

function comparisonTable(): HTMLTableElement {
  const table = document
    .getElementById('pricing-compare-title')
    ?.closest('section')
    ?.querySelector('table');
  if (!table) throw new Error('the comparison section has no table');
  return table;
}

function comparisonPlanHeaders(): HTMLElement[] {
  return [...comparisonTable().querySelectorAll<HTMLElement>('thead th')];
}

function comparisonPlans(): string[] {
  return comparisonPlanHeaders().map(
    (header) => header.querySelector('.agi-compare-plan-name')?.textContent ?? '',
  );
}

function comparisonPlanHeader(plan: string): HTMLElement {
  const header = comparisonPlanHeaders()[comparisonPlans().indexOf(plan)];
  if (!header) throw new Error(`the comparison has no ${plan} column`);
  return header;
}

function comparisonRows(): ComparisonRowView[] {
  const plans = comparisonPlans();
  return [...comparisonTable().querySelectorAll('tbody tr')].flatMap((row) => {
    const header = row.querySelector('th[scope="row"]');
    if (!header) return [];
    const cells = [...row.querySelectorAll('td')];
    expect(cells).toHaveLength(plans.length);
    return [
      {
        label: header.querySelector('.agi-compare-row-label')?.textContent ?? '',
        note: header.querySelector('.agi-compare-row-note')?.textContent ?? '',
        cells: Object.fromEntries(
          plans.map((plan, index) => [plan, comparisonValue(cells[index])]),
        ),
      },
    ];
  });
}

function comparisonRow(label: string): ComparisonRowView {
  const row = comparisonRows().find((candidate) => candidate.label === label);
  if (!row) throw new Error(`the comparison has no "${label}" row`);
  return row;
}

function comparisonColumn(plan: string): Record<string, string> {
  expect(comparisonPlans()).toContain(plan);
  return Object.fromEntries(comparisonRows().map((row) => [row.label, row.cells[plan] ?? '']));
}

function stackedRows(): Array<Omit<ComparisonRowView, 'cells'> & { value: string }> {
  return [...document.querySelectorAll('.agi-compare-stack .agi-compare-stack-item')].map(
    (item) => ({
      label: item.querySelector('dt .agi-compare-row-label')?.textContent ?? '',
      note: item.querySelector('dt .agi-compare-row-note')?.textContent ?? '',
      value: comparisonValue(item.querySelector('dd')),
    }),
  );
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
    // Team is a real per-seat plan: its $25 unit price heads the Team column
    // of the comparison with the per-seat qualifier beside it.
    await showTeamAndEnterprise();
    expect(comparisonPlanHeader('Team')).toHaveTextContent('$25 perSeatPricingSub');
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

  it('prices each seat type in its own row and totals the chosen seats beside the picker', async () => {
    render(<PricingPage />);
    await showTeamAndEnterprise();

    const teamCard = screen.getByRole('heading', { name: 'Team' }).closest('article');
    expect(teamCard).not.toBeNull();
    const card = within(teamCard!);
    expect(teamSeatRow('seatStandardName').getByText('$25')).toBeVisible();
    expect(teamSeatRow('seatStandardName').getByText('perSeatPricingSub')).toBeVisible();
    expect(teamSeatRow('seatPremiumName').getByText('$125')).toBeVisible();
    expect(teamBillingLine()).toBe('billedMonthly');
    expect(card.queryByText(/seatPriceYearlyAlternate/)).toBeNull();
    expect(card.getByText('Seats: 2 · $50/mo')).toBeVisible();

    fireEvent.change(card.getByRole('spinbutton', { name: 'seatCountLabel' }), {
      target: { value: '7' },
    });

    expect(teamSeatRow('seatStandardName').getByText('$25')).toBeVisible();
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
    expect(teamSeatRow('seatStandardName').getByText('$20')).toBeVisible();
    expect(teamSeatRow('seatStandardName').getByText('perSeatPricingSub')).toBeVisible();
    expect(
      teamSeatRow('seatStandardName').getByText('seatPriceMonthlyAlternate $25'),
    ).toBeVisible();
    expect(teamSeatRow('seatPremiumName').getByText('$100')).toBeVisible();
    expect(
      teamSeatRow('seatPremiumName').getByText('seatPriceMonthlyAlternate $125'),
    ).toBeVisible();
    expect(teamBillingLine()).toBe('billedYearly · annualSave');
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
    expect(teamSeatRow('seatStandardName').getByText('$25')).toBeVisible();
    expect(teamSeatRow('seatStandardName').getByText('seatPriceYearlyAlternate $20')).toBeVisible();
    expect(teamSeatRow('seatPremiumName').getByText('$125')).toBeVisible();
    expect(teamBillingLine()).toBe('billedMonthly · annualSave');
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

  it('prices the Team comparison column at the cadence the Team card has selected', async () => {
    mockPricingFetch(TEAM_BOTH_CADENCES);

    render(<PricingPage />);

    await showTeamAndEnterprise();
    const cadence = await screen.findByRole('group', { name: 'Team billing cadence' });
    expect(comparisonPlanHeader('Team')).toHaveTextContent('$20 perSeatPricingSub');
    expect(comparisonPlanHeader('Team')).toHaveTextContent('billedYearly');

    fireEvent.click(within(cadence).getByRole('button', { name: 'monthly' }));

    expect(comparisonPlanHeader('Team')).toHaveTextContent('$25 perSeatPricingSub');
    expect(comparisonPlanHeader('Team')).toHaveTextContent('billedMonthly');
    expect(comparisonPlanHeader('Team')).not.toHaveTextContent('billedYearly');
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

  it('shows the enforceable usage, project, storage, MCP, media, and developer-surface plan differences', async () => {
    render(<PricingPage />);

    const contextFormat = new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 2,
    });
    const column = (
      plan: BillingPlanTier,
      facts: {
        usage: string;
        projects: string;
        storage: string;
        customMcp: string;
        training?: string;
        proFeatures?: boolean;
        video?: boolean;
        teamAdmin?: boolean;
        enterpriseControls?: boolean;
      },
    ) => {
      const included = (yes: boolean | undefined) => (yes ? INCLUDED : NOT_INCLUDED);
      const all = comparisonColumn(BILLING_PLAN_PRICING[plan].label);
      const stated = Object.fromEntries(
        Object.entries(all).filter(([label]) => !label.startsWith('compareModels')),
      );
      expect(stated, plan).toEqual({
        compareRowManagedUsage: facts.usage,
        compareRowContextWindow: `Up to ${contextFormat.format(getPlanContextWindowTokens(plan) ?? 0)} tokens`,
        [CAPABILITY.managed_chat]: INCLUDED,
        [CAPABILITY.projects]: facts.projects,
        compareRowKnowledgeStorage: facts.storage,
        compareRowCustomMcp: facts.customMcp,
        [CAPABILITY.skills_connectors]: INCLUDED,
        [CAPABILITY.agi_work]: included(facts.proFeatures),
        [CAPABILITY.deep_research]: included(facts.proFeatures),
        [CAPABILITY.image_generation]: included(facts.proFeatures),
        [CAPABILITY.video_generation]: included(facts.video),
        [CAPABILITY.managed_api]: included(facts.proFeatures),
        [CAPABILITY.developer_surfaces]: included(facts.proFeatures),
        [CAPABILITY.team_admin]: included(facts.teamAdmin),
        [CAPABILITY.enterprise_controls]: included(facts.enterpriseControls),
        compareRowTrainsOnContent: facts.training ?? 'compareNo',
      });
    };

    column('free', {
      usage: 'compareFreeUsage',
      projects: '1',
      storage: '100 MB',
      customMcp: '1',
      training: 'Not by AGI. Free model providers may.',
    });
    column('basic', {
      usage: '5x more usage per session than Free',
      projects: '5',
      storage: '1 GB',
      customMcp: '5',
    });
    column('pro', {
      usage: '5x more usage than Basic',
      projects: '25',
      storage: '10 GB',
      customMcp: '25',
      proFeatures: true,
    });
    column('max', {
      usage: '5x more usage than Pro',
      projects: 'unlimited',
      storage: 'unlimited',
      customMcp: 'unlimited',
      proFeatures: true,
    });
    column('max_15x', {
      usage: '20x more usage per session than Pro · 10x more weekly usage than Pro',
      projects: 'unlimited',
      storage: 'unlimited',
      customMcp: 'unlimited',
      proFeatures: true,
      video: true,
    });

    await showTeamAndEnterprise();
    column('team', {
      usage: 'Same usage as Pro for every seat',
      projects: '25',
      storage: '25 GB',
      customMcp: '25',
      proFeatures: true,
      teamAdmin: true,
    });
    column('enterprise', {
      usage: 'compareEnterpriseUsage',
      projects: 'custom',
      storage: 'custom',
      customMcp: 'custom',
      proFeatures: true,
      video: true,
      teamAdmin: true,
      enterpriseControls: true,
    });
  });

  it('qualifies the developer-surface row with each surface release status in the table and the plan stack', async () => {
    render(<PricingPage />);

    const status = `${SURFACE_NAMES.cli}: ${SURFACE_STATUS.cli}; ${SURFACE_NAMES.vscode}: ${SURFACE_STATUS.vscode}`;
    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    const check = () => {
      const row = comparisonRow(CAPABILITY.developer_surfaces);
      expect(row.note).toBe(status);
      const plans = Object.entries(row.cells);
      expect(plans.length).toBeGreaterThan(0);
      for (const [plan, value] of plans) {
        const planId = PLAN_ID_BY_LABEL.get(plan);
        expect(planId, plan).toBeDefined();
        expect(value, plan).toBe(
          canUseBillingPlanCapability(planId, 'developer_surfaces') ? INCLUDED : NOT_INCLUDED,
        );
        fireEvent.change(select, { target: { value: planId } });
        const stacked = stackedRows().find(
          (candidate) => candidate.label === CAPABILITY.developer_surfaces,
        );
        expect(stacked, plan).toEqual({ label: row.label, note: status, value });
      }
    };

    check();
    await showTeamAndEnterprise();
    check();
  });

  it('labels the chat and connector rows with what has shipped', () => {
    render(<PricingPage />);

    expect(comparisonRow('Managed Cloud chat on the web').label).toBe(
      planCapabilityLabel('managed_chat'),
    );
    expect(comparisonRows().map((row) => row.label)).not.toContain(
      BILLING_PLAN_CAPABILITY_LABELS.managed_chat,
    );
    const connectorNote = connectorFeatureNote() ?? '';
    expect(connectorNote).not.toBe('');
    expect(comparisonRow(CAPABILITY.skills_connectors).note).toBe(connectorNote);
    expect(comparisonRow('compareRowCustomMcp').note).toBe(connectorNote);
  });

  it('keeps unreleased connectors, MCP servers and CLI access out of the plan cards', async () => {
    expect(connectorFeatureNote()).toBeDefined();
    render(<PricingPage />);

    const lockedKeys =
      /\b(basicFeature5|proFeature2|maxFeature4|maxFeature5|max15xFeature4|max15xFeature5|teamFeature3)\b/;
    expect(document.body.textContent).not.toMatch(lockedKeys);
    expect(screen.getAllByText('chatsAtOnce').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('unlimitedProjectsAndStorage')).toBeInTheDocument();
    await showMax20x();
    expect(document.body.textContent).not.toMatch(lockedKeys);
    expect(screen.getByText('unlimitedProjectsAndStorage')).toBeInTheDocument();
    await showTeamAndEnterprise();
    expect(document.body.textContent).not.toMatch(lockedKeys);
  });

  it('lists Deep Research as a comparison row derived from the plan catalog', async () => {
    render(<PricingPage />);

    expect(comparisonRow('Deep Research').cells).toEqual({
      Free: NOT_INCLUDED,
      Basic: NOT_INCLUDED,
      Pro: INCLUDED,
      'Max 5x': INCLUDED,
      'Max 20x': INCLUDED,
    });
    await showTeamAndEnterprise();
    expect(comparisonRow('Deep Research').cells).toEqual({
      Team: INCLUDED,
      'Team Premium': INCLUDED,
      Enterprise: INCLUDED,
    });
  });

  it('puts plans across the top and grouped capabilities down the side, with no disclosure, toggle or scroll region', async () => {
    render(<PricingPage />);

    const table = screen.getByRole('table', { name: 'compareHeading' });
    expect(table).toBe(comparisonTable());
    expect(document.querySelectorAll('table')).toHaveLength(1);
    expect(document.querySelector('details')).toBeNull();
    expect(document.querySelector('[role="region"]')).toBeNull();
    expect(screen.queryByText(/compare(Show|Hide)FullTable|compareScrollCue/)).toBeNull();
    expect(table.querySelectorAll('button, a, select')).toHaveLength(0);

    expect(comparisonPlans()).toEqual(['Free', 'Basic', 'Pro', 'Max 5x', 'Max 20x']);
    for (const header of comparisonPlanHeaders()) {
      expect(header).toHaveAttribute('scope', 'col');
      expect(header.querySelector('.agi-compare-plan-price')?.textContent?.trim()).not.toBe('');
    }
    expect(comparisonPlanHeader('Free')).toHaveTextContent('$0perMonth');
    expect(comparisonPlanHeader('Basic')).toHaveTextContent('$7perMonth');
    expect(comparisonPlanHeader('Pro')).toHaveTextContent('$20perMonth');
    expect(comparisonPlanHeader('Max 5x')).toHaveTextContent('$100perMonth');
    expect(comparisonPlanHeader('Max 20x')).toHaveTextContent('$200perMonth');

    const groups = [...table.querySelectorAll('tbody')].map((body) => ({
      heading: body.querySelector('tr.agi-compare-group th'),
      rows: [...body.querySelectorAll('th[scope="row"] .agi-compare-row-label')].map(
        (label) => label.textContent,
      ),
    }));
    expect(groups.map((group) => group.heading?.textContent)).toEqual([
      'compareGroupUsage',
      'compareGroupModels',
      'features',
      'compareGroupAdmin',
    ]);
    for (const group of groups) {
      expect(group.heading).toHaveAttribute('scope', 'rowgroup');
      expect(group.heading).toHaveAttribute('colspan', String(comparisonPlans().length + 1));
      expect(group.rows.length).toBeGreaterThan(0);
    }
    expect(groups[0]?.rows).toEqual(['compareRowManagedUsage', 'compareRowContextWindow']);
    expect(groups[2]?.rows).toEqual([
      CAPABILITY.managed_chat,
      CAPABILITY.projects,
      'compareRowKnowledgeStorage',
      'compareRowCustomMcp',
      CAPABILITY.skills_connectors,
      CAPABILITY.agi_work,
      CAPABILITY.deep_research,
      CAPABILITY.image_generation,
      CAPABILITY.video_generation,
      CAPABILITY.managed_api,
      CAPABILITY.developer_surfaces,
    ]);
    expect(groups[3]?.rows).toEqual([
      CAPABILITY.team_admin,
      CAPABILITY.enterprise_controls,
      'compareRowTrainsOnContent',
    ]);
    for (const row of table.querySelectorAll('tbody tr:not(.agi-compare-group)')) {
      expect(row.querySelectorAll('th')).toHaveLength(1);
      expect(row.firstElementChild).toHaveAttribute('scope', 'row');
    }
    expect(table.textContent).not.toMatch(/BestFor|credit/i);

    await showTeamAndEnterprise();
    expect(comparisonPlans()).toEqual(['Team', 'Team Premium', 'Enterprise']);
    expect(comparisonPlanHeader('Enterprise')).toHaveTextContent('custom customPricingSub');
    expect(comparisonPlanHeader('Enterprise')).toHaveTextContent('annualContract');
  });

  it('lists each model tier with its catalog models beneath it and a check for every plan that runs all of them', async () => {
    render(<PricingPage />);

    const roster = [
      ...new Set([
        ...getAllowedModelsForTier('economy'),
        ...getAllowedModelsForTier('pro_additions'),
        ...getAllowedModelsForTier('flagship_additions'),
      ]),
    ];
    const tiers = [
      ['free', 'compareModelsFree'],
      ['basic', 'compareModelsFast'],
      ['pro', 'compareModelsBalanced'],
      ['max', 'compareModelsFlagship'],
    ] as const;
    const matchesCatalog = () => {
      const listed = comparisonRows()
        .filter((row) => row.label.startsWith('compareModels'))
        .map((row) => row.label);
      const expected = tiers.filter(([floor]) =>
        roster.some((modelId) => getMinimumRequiredTier(modelId) === floor),
      );
      expect(listed).toEqual(expected.map(([, label]) => label));
      for (const [floor, label] of expected) {
        const modelIds = roster.filter((modelId) => getMinimumRequiredTier(modelId) === floor);
        const row = comparisonRow(label);
        expect(row.note).toBe(
          modelIds.map((modelId) => getModelMetadataById(modelId)?.name).join(', '),
        );
        for (const [plan, value] of Object.entries(row.cells)) {
          const planId = PLAN_ID_BY_LABEL.get(plan);
          expect(planId, plan).toBeDefined();
          expect(value, `${label} on ${plan}`).toBe(
            modelIds.every((modelId) => canAccessModelForSubscriptionTier(modelId, planId!))
              ? INCLUDED
              : NOT_INCLUDED,
          );
        }
      }
    };

    matchesCatalog();
    expect(comparisonRow('compareModelsFast').cells).toEqual({
      Free: NOT_INCLUDED,
      Basic: INCLUDED,
      Pro: INCLUDED,
      'Max 5x': INCLUDED,
      'Max 20x': INCLUDED,
    });
    expect(comparisonRow('compareModelsBalanced').cells).toEqual({
      Free: NOT_INCLUDED,
      Basic: NOT_INCLUDED,
      Pro: INCLUDED,
      'Max 5x': INCLUDED,
      'Max 20x': INCLUDED,
    });
    expect(comparisonRow('compareModelsFlagship').cells).toEqual({
      Free: NOT_INCLUDED,
      Basic: NOT_INCLUDED,
      Pro: NOT_INCLUDED,
      'Max 5x': INCLUDED,
      'Max 20x': INCLUDED,
    });

    await showTeamAndEnterprise();
    matchesCatalog();
    expect(comparisonRow('compareModelsBalanced').cells).toEqual({
      Team: INCLUDED,
      'Team Premium': INCLUDED,
      Enterprise: INCLUDED,
    });
    expect(comparisonRow('compareModelsFlagship').cells).toEqual({
      Team: NOT_INCLUDED,
      'Team Premium': INCLUDED,
      Enterprise: INCLUDED,
    });
  });

  it('explains Local and BYOK under the table instead of giving them columns', async () => {
    render(<PricingPage />);

    const local = formatPrivacyModeLabel('local');
    const byok = formatPrivacyModeLabel('byok');
    const note = document.querySelector('.agi-compare-footnote');
    expect(note).toHaveTextContent(
      `${local} and ${byok} are always free and are not plans in this table.`,
    );
    expect(note).toHaveTextContent('neither draws on managed usage');
    expect(note).toHaveTextContent(`${SURFACE_NAMES.cli}: ${SURFACE_STATUS.cli}.`);
    expect(note?.textContent).not.toMatch(/\{\{|every surface/);

    const localPlans = [BILLING_PLAN_PRICING['local-only'].label, BILLING_PLAN_PRICING.byok.label];
    for (const plan of localPlans) expect(comparisonPlans()).not.toContain(plan);
    await showTeamAndEnterprise();
    for (const plan of localPlans) expect(comparisonPlans()).not.toContain(plan);
    expect(note).toBeVisible();
  });

  it('feeds the one-plan stack from the same plans, groups and rows as the single comparison table', async () => {
    render(<PricingPage />);

    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    const stack = select.closest('.agi-compare-stack') as HTMLElement;
    const matchesTable = () => {
      const plans = comparisonPlans();
      const options = within(select).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual(plans);
      expect(
        [...stack.querySelectorAll('.agi-compare-stack-heading')].map((h) => h.textContent),
      ).toEqual(
        [...comparisonTable().querySelectorAll('tr.agi-compare-group th')].map(
          (heading) => heading.textContent,
        ),
      );

      for (const option of options) {
        const plan = option.textContent ?? '';
        fireEvent.change(select, { target: { value: (option as HTMLOptionElement).value } });
        expect(stackedRows()).toEqual(
          comparisonRows().map((row) => ({
            label: row.label,
            note: row.note,
            value: row.cells[plan],
          })),
        );
        const price = [...comparisonPlanHeader(plan).querySelectorAll('.agi-compare-plan-price')];
        expect(
          [...stack.querySelectorAll('.agi-compare-stack-price span')].map((s) => s.textContent),
        ).toEqual(price.map((line) => line.textContent));
      }
    };

    matchesTable();
    await showTeamAndEnterprise();
    matchesTable();
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

    function mediaCells(plan: string): string[] {
      const column = comparisonColumn(plan);
      return [CAPABILITY.image_generation, CAPABILITY.video_generation].map(
        (capability) => column[capability] ?? '',
      );
    }

    it('keeps every plan at included or not included when the offer is not running', async () => {
      const offerRead = mockFreeMediaOffer({ image: null, video: null });
      render(<PricingPage />);

      await offerRead();
      expect(mediaCells('Free')).toEqual([NOT_INCLUDED, NOT_INCLUDED]);
      expect(mediaCells('Basic')).toEqual([NOT_INCLUDED, NOT_INCLUDED]);
      expect(mediaCells('Pro')).toEqual([INCLUDED, NOT_INCLUDED]);
      expect(mediaCells('Max 20x')).toEqual([INCLUDED, INCLUDED]);
      expect(screen.queryByText(/^freeMedia/)).toBeNull();
    });

    it('says Limited preview for plans without the capability while it runs, with no line under the page title', async () => {
      mockFreeMediaOffer({ image: { lastDay: '2026-10-20' }, video: { lastDay: '2026-11-04' } });
      render(<PricingPage />);

      await waitFor(() =>
        expect(mediaCells('Free')).toEqual(['Limited preview', 'Limited preview']),
      );
      expect(mediaCells('Basic')).toEqual(['Limited preview', 'Limited preview']);
      expect(mediaCells('Pro')).toEqual([INCLUDED, 'Limited preview']);
      expect(mediaCells('Max 20x')).toEqual([INCLUDED, INCLUDED]);
      expect(screen.queryByText(/^freeMediaLine/)).toBeNull();
      const freeCard = within(screen.getByRole('heading', { name: 'Free' }).closest('article')!);
      expect(freeCard.getByText('freeMediaFeatureBoth')).toBeVisible();

      await showTeamAndEnterprise();
      expect(mediaCells('Team')).toEqual([INCLUDED, 'Limited preview']);
      expect(mediaCells('Enterprise')).toEqual([INCLUDED, INCLUDED]);
    });

    it('names only the kind that is ready', async () => {
      mockFreeMediaOffer({ image: { lastDay: '2026-10-20' }, video: null });
      render(<PricingPage />);

      await waitFor(() => expect(mediaCells('Free')).toEqual(['Limited preview', NOT_INCLUDED]));
      expect(mediaCells('Pro')).toEqual([INCLUDED, NOT_INCLUDED]);
      expect(screen.queryByText(/^freeMediaLine/)).toBeNull();
      expect(screen.getByText('freeMediaFeatureImage')).toBeVisible();
    });

    it('promises nothing when the answer is not the offer it expects', async () => {
      const offerRead = mockFreeMediaOffer({ image: { lastDay: 'soon' }, video: true });
      render(<PricingPage />);

      await offerRead();
      expect(mediaCells('Free')).toEqual([NOT_INCLUDED, NOT_INCLUDED]);
      expect(screen.queryByText(/^freeMedia/)).toBeNull();
    });
  });

  it('states each plan card’s usage relative to the plan below it, never as credit counts', async () => {
    render(<PricingPage />);

    const cardOf = (name: string) =>
      within(screen.getByRole('heading', { name }).closest('article')!);
    expect(cardOf('Basic').queryByText('5x more usage per session than Free')).toBeNull();
    expect(comparisonRow('compareRowManagedUsage').cells['Basic']).toBe(
      '5x more usage per session than Free',
    );
    expect(cardOf('Pro').getByText('5x more usage than Basic')).toBeVisible();
    expect(screen.getAllByText('5x more usage than Pro').length).toBeGreaterThan(0);
    await showMax20x();
    expect(screen.getAllByText('20x more usage per session than Pro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10x more weekly usage than Pro').length).toBeGreaterThan(0);
    expect(screen.getByText('usageWindowsExplainer flagshipShare')).toBeVisible();
    await showTeamAndEnterprise();
    expect(teamSeatRow('seatStandardName').getByText('Same usage as Pro')).toBeVisible();
    expect(
      teamSeatRow('seatPremiumName').getByText('5x the usage of a Standard seat'),
    ).toBeVisible();

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
    expect(comparisonPlanHeader('Pro')).toHaveTextContent('£17perMonth');
    await showTeamAndEnterprise();
    expect(comparisonPlanHeader('Team')).toHaveTextContent('£18 perSeatPricingSub');
    expect(comparisonPlanHeader('Team')).toHaveTextContent('billedMonthly');
  });

  describe('Team seat types', () => {
    const TEAM_PRICES = {
      monthly: { amountMinor: 2_500, currency: 'usd', localized: false, checkoutReady: true },
    };
    const PREMIUM_PRICES = {
      monthly: { amountMinor: 12_500, currency: 'usd', localized: false, checkoutReady: true },
    };

    function mockSeatTypePrices(team: unknown, teamPremium?: unknown) {
      vi.mocked(global.fetch).mockImplementation(async (input) => {
        if (!String(input).includes('/api/pricing/localized')) {
          return new Promise<Response>(() => undefined);
        }
        return {
          ok: true,
          json: async () => ({
            country: 'US',
            requestedCurrency: 'usd',
            plans: {
              basic: {},
              pro: {},
              max: {},
              max_15x: {},
              team,
              ...(teamPremium ? { team_premium: teamPremium } : {}),
            },
          }),
        } as Response;
      });
    }

    function teamCard() {
      return within(screen.getByRole('heading', { name: 'Team' }).closest('article')!);
    }

    it('prices both seat types on the Team card from the catalog', async () => {
      render(<PricingPage />);
      await showTeamAndEnterprise();

      const card = teamCard();
      expect(teamSeatRow('seatStandardName').getByText('$25')).toBeVisible();
      expect(teamSeatRow('seatPremiumName').getByText('$125')).toBeVisible();
      expect(card.getByText('seatTypesNote')).toBeVisible();
      expect(card.queryByText('seatTypeStandardLine')).toBeNull();
      expect(card.queryByText('seatTypePremiumLine')).toBeNull();
    });

    it('gives the Premium seat its own comparison column, priced per seat with the Max 5x limits', async () => {
      render(<PricingPage />);
      await showTeamAndEnterprise();

      expect(comparisonPlanHeader('Team Premium')).toHaveTextContent('$125');
      expect(comparisonPlanHeader('Team Premium')).toHaveTextContent('perSeatPricingSub');
      expect(comparisonPlanHeader('Team')).toHaveTextContent('$25');
      const premium = comparisonColumn('Team Premium');
      const standard = comparisonColumn('Team');
      expect(premium['compareRowManagedUsage']).toBe('usageMultiplierAllPerSeat');
      expect(premium['Team administration']).toBe(INCLUDED);
      expect(premium['compareModelsFlagship']).toBe(INCLUDED);
      expect(standard['compareModelsFlagship']).toBe(NOT_INCLUDED);
      expect(premium['Projects']).not.toBe(standard['Projects']);
    });

    it('totals a mixed team from both seat prices and keeps Premium seats inside the seat count', async () => {
      mockSeatTypePrices(TEAM_PRICES, PREMIUM_PRICES);
      render(<PricingPage />);
      await showTeamAndEnterprise();

      const card = teamCard();
      fireEvent.change(card.getByRole('spinbutton', { name: 'seatCountLabel' }), {
        target: { value: '5' },
      });
      fireEvent.change(await card.findByRole('spinbutton', { name: 'premiumSeatCountLabel' }), {
        target: { value: '9' },
      });

      expect(card.getByRole('spinbutton', { name: 'premiumSeatCountLabel' })).toHaveValue(5);

      fireEvent.change(card.getByRole('spinbutton', { name: 'premiumSeatCountLabel' }), {
        target: { value: '2' },
      });
      expect(card.getByText('seatTotalMixed')).toBeVisible();
    });

    it('carries the Premium seat count into checkout after waitlist-code access', async () => {
      testState.auth.user = { id: 'user-1', email: 'user@example.com' };
      mockSeatTypePrices(TEAM_PRICES, PREMIUM_PRICES);
      render(<PricingPage />);
      await showTeamAndEnterprise();

      const card = teamCard();
      fireEvent.change(await card.findByRole('spinbutton', { name: 'seatCountLabel' }), {
        target: { value: '6' },
      });
      fireEvent.change(await card.findByRole('spinbutton', { name: 'premiumSeatCountLabel' }), {
        target: { value: '2' },
      });

      const teamCta = screen.getByRole('button', { name: 'teamCta' });
      await waitFor(() => expect(teamCta).toBeEnabled());
      fireEvent.click(teamCta);

      expect(await screen.findByText('Waitlist for team')).toBeVisible();
      expect(stripeMocks.upgradeToTeamPlan).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

      await waitFor(() =>
        expect(stripeMocks.upgradeToTeamPlan).toHaveBeenCalledWith({ seats: 6, premiumSeats: 2 }),
      );
    });

    it('offers no Premium seat count where the Team seat is priced in another currency', async () => {
      mockSeatTypePrices(
        {
          monthly: { amountMinor: 199_900, currency: 'inr', localized: true, checkoutReady: true },
        },
        PREMIUM_PRICES,
      );
      render(<PricingPage />);
      await showTeamAndEnterprise();

      const card = teamCard();
      expect(await card.findByText('premiumSeatsUnavailable')).toBeVisible();
      expect(card.queryByRole('spinbutton', { name: 'premiumSeatCountLabel' })).toBeNull();
    });
  });

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
