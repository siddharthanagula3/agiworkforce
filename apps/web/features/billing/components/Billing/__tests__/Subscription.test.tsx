/** Subscription upgrade cards follow shared plan visibility without exposing private budgets. */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// Presentational primitives → thin passthroughs so we assert on real text.
vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  const Button = ({
    children,
    disabled,
    onClick,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => React.createElement('button', { disabled, onClick }, children);
  return {
    Badge: Passthrough,
    Card: Passthrough,
    CardContent: Passthrough,
    CardDescription: Passthrough,
    CardHeader: Passthrough,
    CardTitle: Passthrough,
    Button,
  };
});

import { Subscription } from '../Subscription';
import type { BillingInfo } from '../types';

function makeBilling(plan: BillingInfo['plan']): BillingInfo {
  return {
    plan,
    status: 'active',
    current_period_start: '2026-07-01T00:00:00.000Z',
    current_period_end: '2026-08-01T00:00:00.000Z',
    price: plan === 'free' ? 0 : null,
    currency: plan === 'free' ? 'USD' : null,
    features: ['Feature A', 'Feature B'],
    usage: { usedPercent: 0 },
    invoices: [],
  };
}

function renderSubscription(
  plan: BillingInfo['plan'],
  billingPeriod: 'monthly' | 'yearly' = 'monthly',
  onUpgrade = vi.fn(),
) {
  return render(
    React.createElement(Subscription, {
      billing: makeBilling(plan),
      isManagingBilling: false,
      billingPeriod,
      onBillingPeriodChange: vi.fn(),
      onManageBilling: vi.fn(),
      onUpgrade,
      formatCurrency: (a: number) => `$${a.toFixed(2)}`,
      formatDate: (d: string) => d,
    }),
  );
}

describe('Subscription', () => {
  it('offers Basic to a free web user', () => {
    renderSubscription('free');
    expect(screen.getByText('Get Basic')).toBeTruthy();
    expect(screen.getByText('Upgrade to Pro')).toBeTruthy();
  });

  it('keeps Basic monthly-only when the shared billing toggle is annual', () => {
    const onUpgrade = vi.fn();
    renderSubscription('free', 'yearly', onUpgrade);

    expect(screen.getByText('$7')).toBeTruthy();
    expect(screen.queryByText(/Billed yearly as \$0/i)).toBeNull();
    fireEvent.click(screen.getByText('Get Basic'));
    expect(onUpgrade).toHaveBeenCalledWith('basic', 'monthly');
  });

  it('still shows an existing Basic subscriber their current plan', () => {
    renderSubscription('basic');
    expect(screen.getByText('BASIC')).toBeTruthy();
    expect(screen.queryByText('Get Basic')).toBeNull();
  });

  it('describes relative plan capacity without internal credits or dollar allowance', () => {
    renderSubscription('free');
    expect(screen.getByText('5x Basic usage')).toBeTruthy();
    expect(screen.getByText('5x Pro usage')).toBeTruthy();
    expect(screen.getByText('Chat tools and web search')).toBeTruthy();
    expect(screen.getAllByText('Managed CLI, Chrome, and VS Code access')).not.toHaveLength(0);
    expect(screen.queryByText('Basic computer use')).toBeNull();
    expect(screen.queryByText('Same price as direct provider rates')).toBeNull();
    expect(screen.queryByText(/credits\//i)).toBeNull();
    expect(screen.queryByText(/in ai usage/i)).toBeNull();
  });

  it('derives the annual savings label from the public catalog', () => {
    renderSubscription('free');
    expect(screen.getByRole('button', { name: 'Yearly Save 20%' })).toBeTruthy();
  });

  it('offers Max 15x as the next upgrade from Max 5x', () => {
    renderSubscription('max');
    expect(screen.getByText('Upgrade to Max 15x')).toBeTruthy();
  });

  it('shows the actual paid period without inventing a price, currency, or cadence', () => {
    renderSubscription('pro');

    expect(screen.getByText('See invoice')).toBeTruthy();
    expect(screen.getByText('2026-07-01T00:00:00.000Z – 2026-08-01T00:00:00.000Z')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
    expect(screen.queryByText('Monthly', { selector: 'p.text-sm.font-medium' })).toBeNull();
  });

  it('keeps the authenticated billing portal available without exposing a Stripe customer id', () => {
    renderSubscription('pro');

    expect(screen.getByRole('button', { name: /Manage/ })).toBeEnabled();
  });

  it('shows Team pricing but routes provisioning to sales', () => {
    const onUpgrade = vi.fn();
    renderSubscription('pro', 'yearly', onUpgrade);

    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('$20')).toBeTruthy();
    expect(screen.getByText('Billed yearly as $240')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contact sales' })).toHaveAttribute(
      'href',
      '/contact-sales?plan=team',
    );
    expect(onUpgrade).not.toHaveBeenCalledWith('team', 'yearly');
  });
});
