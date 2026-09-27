import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  PLAN_CREDIT_ALLOWANCES,
  PLAN_LABEL,
  creditAmount,
  managedUsageComparisonLabel,
  type UIPlanTier,
} from '@agiworkforce/types';
import { PlanCard } from './PlanCard';

const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x'] as const;

function bulletTexts(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

function creditWindowBullet(tier: (typeof PAID_TIERS)[number]): string {
  const allowance = PLAN_CREDIT_ALLOWANCES[tier];
  return `${creditAmount(allowance.fiveHour)} credits per 5 hours, ${creditAmount(allowance.weekly)} per week, ${creditAmount(allowance.monthly)} per month`;
}

describe('PlanCard', () => {
  it.each(PAID_TIERS)('opens the %s plan with its credits per window', (tier) => {
    render(<PlanCard tier={tier} isCurrentPlan={false} onCtaClick={vi.fn()} />);

    expect(bulletTexts()[0]).toBe(creditWindowBullet(tier));
    expect(bulletTexts().join('\n')).not.toMatch(/more managed usage than/i);
  });

  it.each(['max', 'max_15x'] as const)('compares %s with Pro window by window', (tier) => {
    const comparison = managedUsageComparisonLabel(tier, 'pro', PLAN_LABEL.pro);
    expect(comparison).not.toBeNull();

    render(<PlanCard tier={tier} isCurrentPlan={false} onCtaClick={vi.fn()} />);

    expect(bulletTexts()[1]).toBe(comparison);
  });

  it.each(['basic', 'pro'] as const)('makes no multiple claim for %s', (tier) => {
    render(<PlanCard tier={tier} isCurrentPlan={false} onCtaClick={vi.fn()} />);

    expect(bulletTexts().join('\n')).not.toMatch(new RegExp(`x ${PLAN_LABEL.pro}\\b|than ${PLAN_LABEL.pro}`));
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

  it.each(['local', 'byok', 'free'] as const satisfies readonly UIPlanTier[])(
    'states no credit window for %s',
    (tier) => {
      render(<PlanCard tier={tier} isCurrentPlan onCtaClick={vi.fn()} />);

      expect(bulletTexts().join('\n')).not.toMatch(/credits per 5 hours/);
    },
  );
});
