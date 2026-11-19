import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextUpgradeTier } from '@agiworkforce/types';
import { formatBillingDateFromSeconds } from '@features/billing/lib/billing-format';

const billingState = vi.hoisted(() => ({
  plan: 'free' as string,
  status: 'active' as string,
  subscription: { subscription_source: 'stripe' } as Record<string, unknown>,
  usagePeriodEnd: null as string | null,
}));

vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: () => ({
    data: {
      plan: billingState.plan,
      status: billingState.status,
      usage: null,
      current_period_end: billingState.usagePeriodEnd,
    },
    isLoading: false,
  }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (select: (state: unknown) => unknown) =>
    select({ subscription: billingState.subscription }),
}));

vi.mock('@shared/stores/billing-policy', () => ({
  isBillingPolicyReady: () => true,
}));

import { UpgradeChooser } from './UpgradeChooser';

describe('UpgradeChooser recommended plan', () => {
  beforeEach(() => {
    billingState.plan = 'free';
    billingState.status = 'active';
    billingState.subscription = { subscription_source: 'stripe' };
    billingState.usagePeriodEnd = null;
  });

  it('marks the next plan up the ladder with a Recommended pill beside its name', () => {
    render(<UpgradeChooser />);

    const next = getNextUpgradeTier('free');
    const section = screen.getByTestId(`upgrade-recommended-${next}`);
    const heading = within(section).getByRole('heading', { level: 2 });
    expect(within(section).getByText('Recommended')).toBeTruthy();
    expect(heading.parentElement).toContainElement(within(section).getByText('Recommended'));
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
  });

  it('shows the plan price under the name and keeps the continue link', () => {
    render(<UpgradeChooser />);

    const next = getNextUpgradeTier('free')!;
    const section = screen.getByTestId(`upgrade-recommended-${next}`);
    expect(within(section).getByText(/\/month$/)).toBeTruthy();
    expect(
      within(section)
        .getByRole('link', { name: /^Continue with / })
        .getAttribute('href'),
    ).toBe(`/upgrade/${next}`);
  });

  it('shows no Recommended pill when there is no plan above the current one', () => {
    billingState.plan = 'team';
    render(<UpgradeChooser />);

    expect(screen.queryByText('Recommended')).toBeNull();
  });
});

describe('UpgradeChooser plan period end', () => {
  const PERIOD_END_UNIX = Math.floor(Date.UTC(2026, 11, 14, 12) / 1000);

  beforeEach(() => {
    billingState.plan = 'pro';
    billingState.status = 'active';
    billingState.usagePeriodEnd = new Date(Date.UTC(2026, 10, 14, 12)).toISOString();
  });

  it('says a card-billed plan renews on its plan period end, not the usage window end', () => {
    billingState.subscription = {
      subscription_source: 'stripe',
      status: 'active',
      current_period_end: PERIOD_END_UNIX,
      cancel_at_period_end: false,
    };
    render(<UpgradeChooser />);

    expect(screen.getByTestId('upgrade-renewal').textContent).toBe(
      `Renews ${formatBillingDateFromSeconds(PERIOD_END_UNIX)}`,
    );
  });

  it('prints no renewal wording and no date for a plan given without a purchase', () => {
    billingState.subscription = {
      subscription_source: 'manual',
      billing_owner: 'personal',
      status: 'active',
      current_period_end: PERIOD_END_UNIX,
      cancel_at_period_end: false,
    };
    render(<UpgradeChooser />);

    expect(screen.queryByTestId('upgrade-renewal')).toBeNull();
    expect(screen.queryByText(/Renews|Included until|2026/)).toBeNull();
  });

  it('says when a plan given without a purchase is set to end', () => {
    billingState.subscription = {
      subscription_source: 'manual',
      billing_owner: 'personal',
      status: 'active',
      current_period_end: PERIOD_END_UNIX,
      cancel_at_period_end: true,
    };
    render(<UpgradeChooser />);

    expect(screen.getByTestId('upgrade-renewal').textContent).toBe(
      `Access ends ${formatBillingDateFromSeconds(PERIOD_END_UNIX)}`,
    );
    expect(screen.queryByText(/Renews/)).toBeNull();
  });
});
