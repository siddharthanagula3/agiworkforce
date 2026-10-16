import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { FREE_QUOTA_MEDIA_OFFER_PATH } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  getPublishedPlanPriceCents,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@agiworkforce/ui');
type ReactI18nextModule = typeof import('react-i18next');

const i18nState = vi.hoisted(() => ({
  t: null as null | ((key: string, values?: Record<string, unknown>) => string),
}));

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
  const fixed = instance.getFixedT('en', 'pricing');
  const t = (key: string, values?: Record<string, unknown>) => {
    if (!instance.exists(key, { ...values, ns: 'pricing' })) {
      throw new Error(`Missing translation: ${key}`);
    }
    return fixed(key, values);
  };
  i18nState.t = t;
  return {
    ...(await importOriginal<ReactI18nextModule>()),
    useTranslation: () => ({ t }),
  };
});

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const { translateUiPlural } = await importOriginal<ScanModule0>();
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    translateUiPlural,
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    Button: ({
      children,
      disabled,
      onClick,
      'aria-label': ariaLabel,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      'aria-label'?: string;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </button>
    ),
  };
});

const waitlistState = vi.hoisted(() => ({
  status: null as null | {
    joinedPlans: string[];
    upgradeGateEnabled: boolean;
    accessGranted: boolean;
  },
  checking: false,
  enabled: [] as boolean[],
}));

vi.mock('@features/billing/hooks/use-upgrade-waitlist', () => ({
  resolveUpgradeWaitlistStatus: vi.fn(),
  useUpgradeWaitlistStatus: ({ enabled }: { enabled?: boolean } = {}) => {
    waitlistState.enabled.push(enabled ?? true);
    return {
      status: waitlistState.status,
      checking: waitlistState.checking,
      recordJoined: vi.fn(),
      recordAccessGranted: vi.fn(),
    };
  },
}));

vi.mock('@shared/components/ServiceNotices', () => ({
  ServiceNotices: ({ scope }: { scope: string }) => (
    <div data-testid="service-notices" data-scope={scope} />
  ),
}));

import { LOCALIZED_PRICING_PATH } from '@features/billing/lib/localized-pricing';
import {
  enterprisePlanFeatures,
  individualPlanFeatures,
  planCtaLabel,
  planTierBody,
  teamPlanFeatures,
  teamSeatRows,
  type PricingT,
} from '@features/billing/lib/plan-card-copy';
import { UpgradePlanDialog } from './UpgradePlanDialog';

const NO_MEDIA_OFFER = { image: null, video: null };

function usd(cents: number | null): string {
  if (cents === null) throw new Error('catalog price missing');
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function priceEntry(cents: number | null, ready: boolean) {
  if (cents === null) return undefined;
  return { amountMinor: cents, currency: 'usd', localized: false, checkoutReady: ready };
}

function localizedCatalog(
  overrides: { notReady?: SelfServePaidPlanTier[]; teamYearlyReady?: boolean } = {},
) {
  const entry = (plan: SelfServePaidPlanTier | 'team_premium', interval: 'monthly' | 'yearly') =>
    priceEntry(
      getPublishedPlanPriceCents(plan, interval),
      interval === 'yearly'
        ? overrides.teamYearlyReady === true
        : !overrides.notReady?.includes(plan as SelfServePaidPlanTier),
    );
  return {
    country: 'US',
    requestedCurrency: 'usd',
    plans: {
      basic: { monthly: entry('basic', 'monthly') },
      pro: { monthly: entry('pro', 'monthly') },
      max: { monthly: entry('max', 'monthly') },
      max_15x: { monthly: entry('max_15x', 'monthly') },
      team: { monthly: entry('team', 'monthly'), yearly: entry('team', 'yearly') },
      team_premium: {
        monthly: entry('team_premium', 'monthly'),
        yearly: entry('team_premium', 'yearly'),
      },
    },
  };
}

const fetchState = vi.hoisted(() => ({
  pricing: null as unknown,
  pricingOk: true,
  mediaOffer: null as unknown,
}));

function t(): PricingT {
  if (!i18nState.t) throw new Error('i18n not initialised');
  return i18nState.t as unknown as PricingT;
}

function card(name: string) {
  return within(screen.getByRole('heading', { name }).closest<HTMLElement>('.rounded-2xl')!);
}

function seatRow(name: string) {
  return within(screen.getByRole('heading', { level: 4, name }).closest('li')!);
}

function renderDialog(props: Partial<React.ComponentProps<typeof UpgradePlanDialog>> = {}) {
  const onUpgrade = vi.fn();
  const view = render(
    <UpgradePlanDialog
      open
      onOpenChange={vi.fn()}
      currentTier="free"
      onUpgrade={onUpgrade}
      {...props}
    />,
  );
  return { ...view, onUpgrade };
}

async function showAllPlans() {
  fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));
  await waitFor(() => expect(screen.queryByText('Loading checkout availability…')).toBeNull());
}

async function pricingSettled() {
  await waitFor(() => expect(screen.queryByText('Loading checkout availability…')).toBeNull());
}

const STAGED_UPGRADES = /Paid upgrades are opening in stages/;

beforeEach(() => {
  waitlistState.status = { joinedPlans: [], upgradeGateEnabled: false, accessGranted: true };
  waitlistState.checking = false;
  waitlistState.enabled = [];
  fetchState.pricing = localizedCatalog();
  fetchState.pricingOk = true;
  fetchState.mediaOffer = NO_MEDIA_OFFER;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === LOCALIZED_PRICING_PATH) {
        return new Response(JSON.stringify(fetchState.pricing), {
          status: fetchState.pricingOk ? 200 : 503,
        });
      }
      if (url === FREE_QUOTA_MEDIA_OFFER_PATH) {
        return new Response(JSON.stringify(fetchState.mediaOffer), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpgradePlanDialog tells the pricing page story', () => {
  it('shows the pricing page individual plans, prices, bodies and features', async () => {
    renderDialog();
    await showAllPlans();

    const individual = ['free', 'basic', 'pro', 'max', 'max_15x'] as const;
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      individual.map((plan) => BILLING_PLAN_PRICING[plan].label),
    );
    for (const plan of individual) {
      const view = card(BILLING_PLAN_PRICING[plan].label);
      const price = plan === 'free' ? usd(0) : usd(getPublishedPlanPriceCents(plan, 'monthly'));
      expect(view.getByText(price)).toBeTruthy();
      expect(view.getByText('/month')).toBeTruthy();
      expect(view.getByText(planTierBody(plan, t()))).toBeTruthy();
      for (const feature of individualPlanFeatures(plan, t(), NO_MEDIA_OFFER)) {
        expect(view.getByText(feature)).toBeTruthy();
      }
    }
  });

  it('never prints a billing cadence line on a plan without a yearly price', async () => {
    renderDialog();
    await showAllPlans();

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Billed yearly, or/);
    for (const plan of ['Free', 'Basic', 'Pro', 'Max 5x', 'Max 20x']) {
      expect(card(plan).queryByText(/billed (yearly|monthly)/i)).toBeNull();
    }
  });

  it('drops the contradictory managed-cloud and CLI subtitle', async () => {
    renderDialog();
    await showAllPlans();

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/open by default/i);
    expect(text).not.toMatch(/sign in and start now/i);
    expect(text).not.toMatch(/always free in the CLI\./);
    expect(text).not.toMatch(/Popular/);
  });

  it('labels paid upgrades with the pricing page CTAs and hands the plan to the waitlist flow', async () => {
    const { onUpgrade } = renderDialog();
    await showAllPlans();

    expect(screen.queryByRole('button', { name: /^Upgrade to / })).toBeNull();
    for (const plan of ['basic', 'max', 'pro', 'max_15x'] as const) {
      fireEvent.click(screen.getByRole('button', { name: planCtaLabel(plan, t()) }));
    }
    expect(onUpgrade.mock.calls).toEqual([
      ['basic', 'checkout'],
      ['max', 'checkout'],
      ['pro', 'checkout'],
      ['max_15x', 'checkout'],
    ]);
  });

  it('shows Team and Enterprise the way the business tab does', async () => {
    renderDialog();
    await showAllPlans();
    fireEvent.click(screen.getByRole('button', { name: t()('audienceBusiness') }));

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      BILLING_PLAN_PRICING.team.label,
      BILLING_PLAN_PRICING.enterprise.label,
    ]);

    const team = card('Team');
    expect(
      seatRow('Standard seat').getByText(usd(getPublishedPlanPriceCents('team', 'monthly'))),
    ).toBeTruthy();
    expect(
      seatRow('Premium seat').getByText(usd(getPublishedPlanPriceCents('team_premium', 'monthly'))),
    ).toBeTruthy();
    expect(team.getAllByText('per seat / month')).toHaveLength(2);
    expect(team.getByText('billed monthly')).toBeTruthy();
    expect(team.queryByText(/when billed yearly/)).toBeNull();
    for (const row of teamSeatRows(t(), localizedCatalog().plans, 'monthly', undefined)) {
      expect(seatRow(row.name).getByText(row.description)).toBeTruthy();
    }
    for (const feature of teamPlanFeatures(t())) {
      expect(team.getByText(feature)).toBeTruthy();
    }
    expect(team.getByRole('link', { name: planCtaLabel('team', t()) })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );

    const enterprise = card('Enterprise');
    expect(enterprise.getByText('Custom')).toBeTruthy();
    for (const feature of enterprisePlanFeatures(t())) {
      expect(enterprise.getByText(feature)).toBeTruthy();
    }
    expect(enterprise.getByRole('link', { name: 'Contact sales' })).toHaveAttribute(
      'href',
      '/contact-sales',
    );
  });

  it('prices Team yearly only when the yearly price is checkout ready', async () => {
    fetchState.pricing = localizedCatalog({ teamYearlyReady: true });
    renderDialog({ currentTier: 'pro', targetTier: 'team' });

    for (const plan of ['team', 'team_premium'] as const) {
      const yearlyCents = getPublishedPlanPriceCents(plan, 'yearly');
      if (yearlyCents === null) throw new Error(`${plan} has no yearly price`);
      const name = plan === 'team' ? 'Standard seat' : 'Premium seat';
      expect(await seatRow(name).findByText(usd(Math.round(yearlyCents / 12)))).toBeTruthy();
      expect(
        seatRow(name).getByText(
          t()('seatPriceMonthlyAlternate', {
            price: usd(getPublishedPlanPriceCents(plan, 'monthly')),
          }),
        ),
      ).toBeTruthy();
    }
    expect(card('Team').getByText('billed yearly')).toBeTruthy();
  });

  it('carries the free media offer line the pricing page shows on Free', async () => {
    fetchState.mediaOffer = { image: { lastDay: null }, video: null };
    renderDialog();
    expect(await card('Free').findByText(t()('freeMediaFeatureImage'))).toBeTruthy();
  });

  it('blocks a paid CTA the pricing page would block for the region', async () => {
    fetchState.pricing = localizedCatalog({ notReady: ['pro'] });
    renderDialog();
    await showAllPlans();

    expect(screen.getByText('Pro checkout is not available in your region yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: planCtaLabel('pro', t()) })).toBeDisabled();
    expect(screen.getByRole('button', { name: planCtaLabel('max', t()) })).toBeEnabled();
  });

  it('blocks paid CTAs when checkout availability cannot be verified', async () => {
    fetchState.pricingOk = false;
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));

    expect(
      await screen.findByText(
        'Checkout availability could not be verified. Refresh this page to try again.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: planCtaLabel('basic', t()) })).toBeDisabled();
  });

  it('focuses the exact required tier carried by a transcript refusal', async () => {
    renderDialog({ currentTier: 'pro', targetTier: 'max_15x' });

    expect(screen.getAllByText('Upgrade to Max 20x').length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByRole('button', { name: planCtaLabel('max_15x', t()) })).toBeEnabled();
    expect(screen.queryByRole('button', { name: planCtaLabel('max', t()) })).toBeNull();
  });

  it('never offers a Team member an individual upgrade', async () => {
    renderDialog({ currentTier: 'team' });
    await showAllPlans();
    fireEvent.click(screen.getByRole('button', { name: t()('audienceIndividual') }));

    for (const plan of ['basic', 'pro', 'max', 'max_15x'] as const) {
      expect(screen.queryByRole('button', { name: planCtaLabel(plan, t()) })).toBeNull();
    }
  });

  it('shows a Premium seat holder exactly what a Standard seat holder sees, never Free as their plan', async () => {
    const standard = renderDialog({ currentTier: 'team' });
    await showAllPlans();
    const standardMarkup = standard.container.innerHTML;
    expect(within(standard.container).getByRole('link', { name: 'Update seats' })).toBeTruthy();
    standard.unmount();

    const premium = renderDialog({ currentTier: 'team_premium' });
    await showAllPlans();

    expect(premium.container.innerHTML).toBe(standardMarkup);
    fireEvent.click(screen.getByRole('button', { name: t()('audienceIndividual') }));
    expect(card('Free').queryByText('Your current plan')).toBeNull();
  });

  it('marks nothing current and offers the full ladder while the plan is unknown', async () => {
    renderDialog({ currentTier: undefined });

    await waitFor(() => expect(screen.queryByText('Loading checkout availability…')).toBeNull());
    expect(screen.queryByText('Your current plan')).toBeNull();
    expect(screen.queryByRole('button', { name: 'See all plans' })).toBeNull();
    expect(card('Free').queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: planCtaLabel('pro', t()) })).toBeEnabled();
  });
});

describe('UpgradePlanDialog while paid upgrades open in stages', () => {
  function stageUpgrades(joinedPlans: string[] = []) {
    waitlistState.status = { joinedPlans, upgradeGateEnabled: true, accessGranted: false };
  }

  it('carries billing service notices, where a billing outage is scoped', async () => {
    renderDialog({ waitlistApplies: true });
    await pricingSettled();

    expect(screen.getByTestId('service-notices')).toHaveAttribute('data-scope', 'billing');
  });

  it('keeps billing trouble off a dialog that only offers the waitlist, which never reaches billing', async () => {
    stageUpgrades();
    renderDialog({ waitlistApplies: true });
    await pricingSettled();

    expect(
      screen.getByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    ).toBeVisible();
    expect(screen.queryByTestId('service-notices')).toBeNull();
  });

  it('keeps the current plan card at full contrast and marks it by its label', async () => {
    renderDialog({ waitlistApplies: true });
    await pricingSettled();

    const free = screen
      .getByRole('heading', { name: 'Free' })
      .closest<HTMLElement>('.rounded-2xl')!;
    expect(free.className).not.toMatch(/(^|\s)opacity-/);
    expect(within(free).getByRole('button', { name: 'Your current plan' })).toBeDisabled();
  });

  it('offers no action on the Free card before the plan is known', async () => {
    stageUpgrades();
    const { onUpgrade } = renderDialog({ currentTier: undefined, waitlistApplies: true });
    await pricingSettled();

    expect(card('Free').queryByRole('button')).toBeNull();
    expect(
      screen.getByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    ).toBeEnabled();
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it.each(['local-only', 'byok'])(
    'shows the Free card as the current plan of a %s account',
    async (tier) => {
      stageUpgrades();
      const { onUpgrade } = renderDialog({ currentTier: tier, waitlistApplies: true });
      await pricingSettled();

      expect(card('Free').getByRole('button', { name: 'Your current plan' })).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
      );

      expect(onUpgrade.mock.calls).toEqual([['basic', 'join-waitlist']]);
    },
  );

  it('joins the waitlist instead of offering checkout while paid upgrades are staged', async () => {
    stageUpgrades();
    const { onUpgrade } = renderDialog({ waitlistApplies: true });
    await pricingSettled();

    expect(screen.getByText(STAGED_UPGRADES)).toBeVisible();
    expect(screen.queryByRole('button', { name: planCtaLabel('basic', t()) })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    );

    expect(onUpgrade).toHaveBeenCalledWith('basic', 'join-waitlist');
  });

  it('shows a plan the account already joined as on the waitlist, with the access code still reachable', async () => {
    stageUpgrades(['basic']);
    const { onUpgrade } = renderDialog({ waitlistApplies: true });
    await pricingSettled();

    const basic = card('Basic');
    expect(basic.getByText(t()('onPlanWaitlistNote'))).toBeVisible();
    expect(
      basic.queryByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    ).toBeNull();
    fireEvent.click(
      basic.getByRole('button', { name: t()('enterAccessCodeForPlan', { plan: 'Basic' }) }),
    );

    expect(onUpgrade).toHaveBeenCalledWith('basic', 'open-waitlist');
  });

  it('offers checkout to an account that holds access', async () => {
    waitlistState.status = {
      joinedPlans: ['basic'],
      upgradeGateEnabled: true,
      accessGranted: true,
    };
    const { onUpgrade } = renderDialog({ waitlistApplies: true });

    const checkout = await screen.findByRole('button', { name: planCtaLabel('basic', t()) });
    await waitFor(() => expect(checkout).toBeEnabled());
    expect(screen.queryByText(STAGED_UPGRADES)).toBeNull();
    fireEvent.click(checkout);

    expect(onUpgrade).toHaveBeenCalledWith('basic', 'checkout');
  });

  it('holds the paid plan buttons while upgrade access is being read', async () => {
    waitlistState.status = null;
    waitlistState.checking = true;
    const { onUpgrade } = renderDialog({ waitlistApplies: true });
    await pricingSettled();

    const pending = screen.getByRole('button', { name: 'Checking upgrade access for Basic' });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(onUpgrade).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: planCtaLabel('basic', t()) })).toBeNull();
    expect(screen.queryByTestId('service-notices')).toBeNull();
    expect(waitlistState.enabled).toContain(true);
  });

  it('offers the waitlist join when upgrade access cannot be read, as the order screen and pricing do', async () => {
    waitlistState.status = null;
    const { onUpgrade } = renderDialog({ waitlistApplies: true });
    await pricingSettled();

    expect(screen.getByText(STAGED_UPGRADES)).toBeVisible();
    expect(screen.queryByRole('button', { name: planCtaLabel('basic', t()) })).toBeNull();
    expect(screen.queryByTestId('service-notices')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: t()('joinPlanWaitlistCta', { plan: 'Basic' }) }),
    );

    expect(onUpgrade.mock.calls).toEqual([['basic', 'join-waitlist']]);
  });

  it('never asks a paying subscriber about the waitlist', async () => {
    stageUpgrades();
    renderDialog({ currentTier: 'pro', waitlistApplies: false });

    expect(await screen.findByRole('button', { name: planCtaLabel('max', t()) })).toBeVisible();
    expect(screen.queryByText(STAGED_UPGRADES)).toBeNull();
    expect(waitlistState.enabled).not.toContain(true);
  });
});
