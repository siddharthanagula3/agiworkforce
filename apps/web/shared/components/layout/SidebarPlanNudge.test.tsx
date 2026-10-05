import { fireEvent, render, screen } from '@testing-library/react';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { describe, expect, it, vi } from 'vitest';
import { SidebarFreePlanNudge, SidebarPlanBadge } from './SidebarPlanNudge';

const freeLabel = getBillingPlanPricing('free').label;
const paidLabel = getBillingPlanPricing('pro').label;

describe('sidebar footer plan chrome', () => {
  it('free tier: the nudge and the badge together offer one Upgrade, and it is a button', () => {
    const onUpgrade = vi.fn();

    render(
      <>
        <SidebarFreePlanNudge onUpgrade={onUpgrade} />
        <SidebarPlanBadge tierLabel={freeLabel} isFreeTier />
      </>,
    );

    const upgrades = screen.getAllByText('Upgrade');
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]?.tagName).toBe('BUTTON');

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('free tier: the badge alone renders nothing', () => {
    const { container } = render(<SidebarPlanBadge tierLabel={freeLabel} isFreeTier />);

    expect(container).toBeEmptyDOMElement();
  });

  it('paid tier: the badge names the plan and offers no upgrade', () => {
    render(<SidebarPlanBadge tierLabel={paidLabel} isFreeTier={false} />);

    expect(screen.getByText(paidLabel)).toBeInTheDocument();
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('unknown plan: a null tier label renders nothing for either tier flag', () => {
    const paid = render(<SidebarPlanBadge tierLabel={null} isFreeTier={false} />);
    expect(paid.container).toBeEmptyDOMElement();
    paid.unmount();

    const free = render(<SidebarPlanBadge tierLabel={null} isFreeTier />);
    expect(free.container).toBeEmptyDOMElement();
  });
});
