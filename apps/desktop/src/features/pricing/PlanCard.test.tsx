import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  PLAN_LABEL,
  getPublishedPlanPricePerMonthUsd,
  managedUsageComparisonLines,
  type UIPlanTier,
} from '@agiworkforce/types';
import { PlanCard } from './PlanCard';

const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team'] as const;

function bulletTexts(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

describe('PlanCard', () => {
  it.each(PAID_TIERS)('opens the %s plan with its usage relative to the plan below it', (tier) => {
    const lines = managedUsageComparisonLines(tier);
    expect(lines.length).toBeGreaterThan(0);

    render(<PlanCard tier={tier} isCurrentPlan={false} onCtaClick={vi.fn()} />);

    expect(bulletTexts().slice(0, lines.length)).toEqual(lines);
    expect(bulletTexts().join('\n')).not.toMatch(/credits per|per 5 hours/i);
  });

  it('states Max 20x per session and per week against Pro', () => {
    render(<PlanCard tier="max_15x" isCurrentPlan={false} onCtaClick={vi.fn()} />);

    expect(bulletTexts().slice(0, 2)).toEqual([
      '20x more usage per session than Pro',
      '10x more weekly usage than Pro',
    ]);
  });

  it('sells the $200 plan under its catalog name, Max 20x', () => {
    const onCtaClick = vi.fn();
    expect(BILLING_PLAN_PRICING.max_15x.label).toBe('Max 20x');

    render(<PlanCard tier="max_15x" isCurrentPlan={false} onCtaClick={onCtaClick} />);

    expect(screen.getByText(BILLING_PLAN_PRICING.max_15x.label)).toBeInTheDocument();
    expect(
      screen.getByText(`$${BILLING_PLAN_PRICING.max_15x.monthlyPriceUsd} / mo`),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Upgrade to ${PLAN_LABEL.max_15x}` }));
    expect(onCtaClick).toHaveBeenCalledWith('max_15x');
  });

  it('prices Team per seat on yearly billing and names the monthly seat price', () => {
    const onCtaClick = vi.fn();

    render(<PlanCard tier="team" isCurrentPlan={false} onCtaClick={onCtaClick} />);

    expect(
      screen.getByText(`$${getPublishedPlanPricePerMonthUsd('team', 'yearly')} / seat / mo`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Billed yearly, or $${BILLING_PLAN_PRICING.team.monthlyPriceUsd} per seat billed monthly`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`$${BILLING_PLAN_PRICING.team.yearlyPriceUsd}`, { exact: false }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose seats' }));
    expect(onCtaClick).toHaveBeenCalledWith('team');
  });

  it.each(['local', 'byok', 'free'] as const satisfies readonly UIPlanTier[])(
    'states no usage comparison or credit window for %s',
    (tier) => {
      render(<PlanCard tier={tier} isCurrentPlan onCtaClick={vi.fn()} />);

      expect(bulletTexts().join('\n')).not.toMatch(/credits per 5 hours|more usage|same usage/i);
    },
  );
});
