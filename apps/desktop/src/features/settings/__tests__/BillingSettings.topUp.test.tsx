import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CENTS_PER_USD,
  DAILY_TOP_UP_LIMIT_USD,
  MANAGED_USAGE_LIMITS,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  PLAN_LABEL,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  formatCredits,
  getNextUpgradeTier,
  getPlanPriceUsd,
  quoteTopUp,
  type TopUpQuote,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('../../../utils/navigation');

const authState = vi.hoisted(() => ({
  plan: 'pro' as string | null,
  subscriptionStatus: 'active',
  currentPeriodEnd: Date.UTC(2026, 8, 1),
  planDisplayName: 'Pro',
  subscriptionCancelAtPeriodEnd: false,
  subscriptionSource: 'stripe',
  subscriptionFetchStatus: 'succeeded',
}));

const openTopUpCheckout = vi.hoisted(() =>
  vi.fn(async (_amountUsd: number) => null as string | null),
);
const openExternalUrl = vi.hoisted(() => vi.fn(async (_url: string) => undefined));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => true,
  selectPlan: (state: typeof authState) => state.plan,
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('../../../lib/stripeCheckout', () => ({
  openBillingPortal: vi.fn(),
  openTopUpCheckout,
}));

vi.mock('../../../utils/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  openExternalUrl,
}));

import { WEB_APP_URL } from '../../../api/config';
import { BillingSettings } from '../BillingSettings';
import { CreditTopUp } from '../CreditTopUp';

function usd(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % CENTS_PER_USD === 0 ? 0 : 2,
  }).format(cents / CENTS_PER_USD);
}

function quote(amountUsd: number): TopUpQuote {
  const quoted = quoteTopUp(amountUsd);
  if (!quoted) throw new Error(`${amountUsd} is not a purchasable top-up amount`);
  return quoted;
}

function buyLabel(quoted: TopUpQuote): string {
  return `Buy ${formatCredits(quoted.credits)} for ${usd(quoted.priceCents)}`;
}

function packButtons(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'Credit packs' })).getAllByRole('button');
}

beforeEach(() => {
  openTopUpCheckout.mockClear();
  openTopUpCheckout.mockResolvedValue(null);
  openExternalUrl.mockClear();
  Object.assign(authState, {
    plan: 'pro',
    subscriptionStatus: 'active',
    subscriptionSource: 'stripe',
    subscriptionFetchStatus: 'succeeded',
  });
});

describe('BillingSettings usage top-up', () => {
  it('sells every preset pack at its quoted credits, price and discount', () => {
    render(<BillingSettings />);

    const packs = packButtons();
    expect(packs).toHaveLength(TOP_UP_PRESET_AMOUNTS_USD.length);
    TOP_UP_PRESET_AMOUNTS_USD.forEach((amountUsd, index) => {
      const quoted = quote(amountUsd);
      const pack = packs[index];
      expect(pack).toHaveTextContent(formatCredits(quoted.credits));
      expect(pack).toHaveTextContent(usd(quoted.priceCents));
      if (quoted.discountPercent > 0) {
        expect(pack).toHaveTextContent(`${quoted.discountPercent}% off`);
      } else {
        expect(pack).not.toHaveTextContent('off');
      }
    });
    expect(packs[0]).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: buyLabel(quote(TOP_UP_PRESET_AMOUNTS_USD[0])) }),
    ).toBeEnabled();
  });

  it('reaches checkout with the amount of the pack the user picked', async () => {
    const user = userEvent.setup();
    const discountedIndex = TOP_UP_PRESET_AMOUNTS_USD.findIndex(
      (amountUsd) => quote(amountUsd).discountPercent > 0,
    );
    expect(discountedIndex).toBeGreaterThan(0);
    const picked = quote(TOP_UP_PRESET_AMOUNTS_USD[discountedIndex]!);
    render(<BillingSettings />);

    await user.click(packButtons()[discountedIndex]!);
    expect(packButtons()[discountedIndex]).toHaveAttribute('aria-pressed', 'true');
    expect(packButtons()[0]).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: buyLabel(picked) }));

    await waitFor(() => expect(openTopUpCheckout).toHaveBeenCalledWith(picked.amountUsd));
    expect(openTopUpCheckout).toHaveBeenCalledTimes(1);
  });

  it('surfaces the checkout refusal instead of failing silently', async () => {
    openTopUpCheckout.mockResolvedValue('Top-up balance storage is being prepared.');
    const user = userEvent.setup();
    render(<BillingSettings />);

    await user.click(screen.getByRole('button', { name: /^Buy / }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Top-up balance storage is being prepared.',
    );
  });

  it('buys only a whole-dollar amount inside the purchasable range', async () => {
    const user = userEvent.setup();
    render(<BillingSettings />);
    const otherAmount = screen.getByLabelText('Other amount in whole dollars');
    const outOfRange = `Enter a whole-dollar amount from ${usd(MIN_TOP_UP_AMOUNT_USD * CENTS_PER_USD)} to ${usd(MAX_TOP_UP_AMOUNT_USD * CENTS_PER_USD)}`;

    for (const rejected of [
      String(MIN_TOP_UP_AMOUNT_USD - 1),
      `${MIN_TOP_UP_AMOUNT_USD}.5`,
      String(MAX_TOP_UP_AMOUNT_USD + 1),
    ]) {
      await user.clear(otherAmount);
      await user.type(otherAmount, rejected);
      expect(screen.getByRole('button', { name: outOfRange })).toBeDisabled();
    }

    const customAmount = MIN_TOP_UP_AMOUNT_USD + 1;
    expect(TOP_UP_PRESET_AMOUNTS_USD).not.toContain(customAmount);
    await user.clear(otherAmount);
    await user.type(otherAmount, String(customAmount));
    await user.click(screen.getByRole('button', { name: buyLabel(quote(customAmount)) }));

    await waitFor(() => expect(openTopUpCheckout).toHaveBeenCalledWith(customAmount));
    expect(packButtons().every((pack) => pack.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('discloses expiry, refunds, tax and the daily limit before purchase', async () => {
    const user = userEvent.setup();
    render(<BillingSettings />);

    const section = screen.getByRole('region', { name: 'Buy credits' });
    expect(section).toHaveTextContent('don’t expire');
    expect(section).toHaveTextContent(
      `Up to ${usd(DAILY_TOP_UP_LIMIT_USD * CENTS_PER_USD)} a day.`,
    );
    expect(section).toHaveTextContent('Tax calculated at checkout.');

    await user.click(within(section).getByRole('button', { name: 'refund policy' }));
    expect(openExternalUrl).toHaveBeenCalledWith(`${WEB_APP_URL}/refund-policy`);
  });

  it('offers credits during a web trial', () => {
    Object.assign(authState, { subscriptionStatus: 'trialing' });

    render(<BillingSettings />);

    expect(screen.getByRole('region', { name: 'Buy credits' })).toBeInTheDocument();
  });

  it.each(['past_due', 'canceled', 'none'])(
    'does not offer credits on a %s subscription',
    (subscriptionStatus) => {
      Object.assign(authState, { subscriptionStatus });

      render(<BillingSettings />);

      expect(screen.queryByRole('region', { name: 'Buy credits' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Buy / })).not.toBeInTheDocument();
    },
  );

  it('does not offer a top-up for a store-owned subscription', () => {
    Object.assign(authState, { subscriptionSource: 'apple' });

    render(<BillingSettings />);

    expect(screen.queryByRole('region', { name: 'Buy credits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Buy / })).not.toBeInTheDocument();
  });
});

describe('CreditTopUp upgrade prompt', () => {
  function creditsPerDollarRatio(plan: string): { label: string; ratio: string } {
    const next = getNextUpgradeTier(plan);
    if (!next) throw new Error(`${plan} has no upgrade`);
    const price = getPlanPriceUsd(next, 'monthly');
    if (!price) throw new Error(`${next} has no monthly price`);
    const ratio = MANAGED_USAGE_LIMITS[next].monthlyCredits / price / TOP_UP_UNITS_PER_USD;
    return {
      label: PLAN_LABEL[next],
      ratio: ratio.toLocaleString(undefined, { maximumFractionDigits: 1 }),
    };
  }

  it.each(['free', 'basic', 'pro'])(
    'tells a %s plan how many more credits per dollar the next plan gives',
    async (plan) => {
      const user = userEvent.setup();
      const onComparePlans = vi.fn();
      Object.assign(authState, { plan });
      const { label, ratio } = creditsPerDollarRatio(plan);

      render(<CreditTopUp onComparePlans={onComparePlans} />);

      expect(
        screen.getByText(`${label} gives you ${ratio}x more credits per dollar.`),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Compare plans' }));
      expect(onComparePlans).toHaveBeenCalledTimes(1);
    },
  );

  it('states the ratio without a Compare plans action when none is wired', () => {
    Object.assign(authState, { plan: 'pro' });
    const { label, ratio } = creditsPerDollarRatio('pro');

    render(<CreditTopUp />);

    expect(
      screen.getByText(`${label} gives you ${ratio}x more credits per dollar.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare plans' })).not.toBeInTheDocument();
  });

  it.each(['max', 'max_15x', 'team', 'enterprise'])(
    'does not push a %s plan to upgrade for credits',
    (plan) => {
      Object.assign(authState, { plan });

      render(<CreditTopUp onComparePlans={vi.fn()} />);

      expect(screen.queryByText(/more credits per dollar/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Compare plans' })).not.toBeInTheDocument();
    },
  );
});
