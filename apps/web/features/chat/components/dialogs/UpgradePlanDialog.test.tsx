import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const { translateUiPlural } = await importOriginal<typeof import('@agiworkforce/ui')>();
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
    expect(screen.getByText('Max 20x')).toBeTruthy();
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

  it('offers no annual billing and never sends Team through personal checkout', () => {
    const onUpgrade = vi.fn();
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={onUpgrade} />,
    );

    expect(screen.queryByRole('button', { name: 'Annual' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Basic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Max 5x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    expect(onUpgrade.mock.calls).toEqual([['basic'], ['max'], ['pro']]);
  });

  it('prices Team per seat on yearly billing and hands off to the seat control instead of sales', () => {
    render(
      <UpgradePlanDialog open onOpenChange={vi.fn()} currentTier="free" onUpgrade={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See all plans' }));

    expect(screen.queryByText('Custom')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Contact sales' })).toBeNull();
    const teamCard = within(
      screen.getByRole('heading', { name: 'Team' }).closest<HTMLElement>('.rounded-2xl')!,
    );
    expect(teamCard.getByText('$20')).toBeTruthy();
    expect(teamCard.getByText('USD / seat / month')).toBeTruthy();
    expect(teamCard.getByText('Billed yearly, or $25 billed monthly')).toBeTruthy();
    expect(teamCard.queryByText('$240')).toBeNull();
    expect(screen.getByRole('link', { name: 'Choose seats' })).toHaveAttribute(
      'href',
      '/pricing#pricing-team-title',
    );
  });

  it('focuses the exact required tier carried by a transcript refusal', () => {
    render(
      <UpgradePlanDialog
        open
        onOpenChange={vi.fn()}
        currentTier="pro"
        targetTier="max_15x"
        onUpgrade={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Upgrade to Max 20x').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Upgrade to Max 20x' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Max 5x' })).toBeNull();
  });
});
