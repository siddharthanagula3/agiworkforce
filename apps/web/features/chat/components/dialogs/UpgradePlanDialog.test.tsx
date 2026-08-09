import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    Button: ({
      children,
      disabled,
      onClick,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

import { UpgradePlanDialog } from './UpgradePlanDialog';

describe('UpgradePlanDialog', () => {
  it('renders every selectable paid Web tier from the shared catalog', () => {
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));

    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Max 5x')).toBeTruthy();
    expect(screen.getByText('Max 15x')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('1 project')).toBeTruthy();
    expect(screen.getByText('1 custom MCP server')).toBeTruthy();
    expect(screen.getByText('5 projects')).toBeTruthy();
    expect(screen.getByText('5 custom MCP servers')).toBeTruthy();
    expect(screen.getAllByText('25 projects').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('25 custom MCP servers').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Up to 5 Projects and 1 custom remote MCP')).toBeNull();
    expect(screen.queryByText('Unlimited Projects')).toBeNull();
  });

  it('never sends an annual interval for monthly-only tiers or Team through personal checkout', () => {
    const onUpgrade = vi.fn();
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={onUpgrade} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Basic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Max 5x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    expect(onUpgrade).toHaveBeenCalledWith('basic', false);
    expect(onUpgrade).toHaveBeenCalledWith('max', false);
    expect(onUpgrade).toHaveBeenCalledWith('pro', true);
    expect(onUpgrade).not.toHaveBeenCalledWith('team', expect.anything());
  });

  it('prices Team per seat and hands off to the seat control instead of sales', () => {
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));

    // Team is a published per-seat price, not a negotiated one. "Custom" and a
    // sales hand-off contradicted BILLING_PLAN_PRICING.team and the pricing
    // page, which sells Team self-serve.
    expect(screen.queryByText('Custom')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Contact sales' })).toBeNull();
    expect(screen.getByText('$25')).toBeTruthy();
    expect(screen.getByText('USD / seat / month')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choose seats' })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );
  });
});
