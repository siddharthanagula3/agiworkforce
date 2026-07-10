/**
 * Subscription.test.tsx
 *
 * Guards the Basic-is-mobile-only display rule (founder decision, 2026-07) on
 * the web billing dashboard:
 *   - Basic is never offered as an upgrade option on web (even to a free user).
 *   - An existing Basic subscriber STILL sees their plan in the current-plan
 *     card (hide-from-selection must not hide the user's own plan).
 *
 * Uses the real @agiworkforce/types helper (isPlanSelectableOnSurface) so the
 * catalog rule and the UI stay in lock-step; only the presentational
 * @agiworkforce/ui + lucide-react layers are stubbed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Presentational primitives → thin passthroughs so we assert on real text.
vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  const Button = ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children);
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
    price: plan === 'free' ? 0 : 8,
    currency: 'USD',
    features: ['Feature A', 'Feature B'],
    usage: { totalTokens: 0, totalLimit: 0, totalCost: 0, llmUsage: [] },
    invoices: [],
  };
}

function renderSubscription(plan: BillingInfo['plan']) {
  return render(
    React.createElement(Subscription, {
      billing: makeBilling(plan),
      stripeCustomerId: null,
      isManagingBilling: false,
      billingPeriod: 'monthly',
      onBillingPeriodChange: vi.fn(),
      onManageBilling: vi.fn(),
      onUpgrade: vi.fn(),
      formatCurrency: (a: number) => `$${a.toFixed(2)}`,
      formatDate: (d: string) => d,
    }),
  );
}

describe('Subscription — Basic is mobile-only on web', () => {
  it('does not offer Basic as an upgrade option to a free web user', () => {
    renderSubscription('free');
    // The web upgrade ladder skips Basic straight to Pro.
    expect(screen.queryByText('Get Basic')).toBeNull();
    expect(screen.getByText('Upgrade to Pro')).toBeTruthy();
  });

  it('still shows an existing Basic subscriber their current plan', () => {
    renderSubscription('basic');
    // Current-plan badge reflects the real tier...
    expect(screen.getByText('BASIC')).toBeTruthy();
    // ...but Basic is never re-offered as a selectable upgrade card.
    expect(screen.queryByText('Get Basic')).toBeNull();
  });
});
