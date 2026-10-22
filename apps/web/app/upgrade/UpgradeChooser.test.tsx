import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextUpgradeTier } from '@agiworkforce/types';

const billingState = vi.hoisted(() => ({
  plan: 'free' as string,
  status: 'active' as string,
}));

vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: () => ({
    data: { plan: billingState.plan, status: billingState.status, usage: null },
    isLoading: false,
  }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (select: (state: unknown) => unknown) =>
    select({ subscription: { subscription_source: 'stripe' } }),
}));

vi.mock('@shared/stores/billing-policy', () => ({
  isBillingPolicyReady: () => true,
}));

import { UpgradeChooser } from './UpgradeChooser';

describe('UpgradeChooser recommended plan', () => {
  beforeEach(() => {
    billingState.plan = 'free';
    billingState.status = 'active';
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
