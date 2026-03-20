/**
 * PlanBadge tests
 *
 * Covers:
 * - Loading state: renders a skeleton pulse pill, no button
 * - Error state: renders nothing (null)
 * - No data (billing null): renders nothing (null)
 * - Free tier: pill label "Free · Upgrade →", tooltip upgrade CTA, freePillClasses applied
 * - Paid tiers (pro, enterprise, max):
 *   - Green variant: > 50% remaining
 *   - Yellow/amber variant: 25-50% remaining
 *   - Red variant: < 25% remaining
 *   - Correct pill label format: "{Plan} · $X.XX left"
 *   - Correct tooltip format: "$X.XX credits remaining · Resets {date}"
 * - formatResetDate:
 *   - Valid ISO date → "Mon D" format
 *   - Invalid string → "next month"
 *   - Empty string → "next month"
 * - Click navigates to /dashboard/billing
 * - aria-label includes plan name and tooltip text
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  billingData: null as null | unknown,
  isLoading: false,
  isError: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: () => ({
    data: mocks.billingData,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
  }),
}));

// Stub Tooltip primitives — just render children/content directly so we can
// assert on tooltip text without needing a hover interaction in jsdom.
vi.mock('@shared/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

import { PlanBadge } from './PlanBadge';
import type { BillingInfo } from '@features/billing/hooks/use-billing-queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBilling(
  plan: string,
  balanceCents: number,
  totalLimitTokens: number,
  periodEnd = '2026-04-01T00:00:00.000Z',
): BillingInfo {
  return {
    plan: plan as BillingInfo['plan'],
    status: 'active',
    current_period_start: '2026-03-01T00:00:00.000Z',
    current_period_end: periodEnd,
    price: 29,
    currency: 'USD',
    features: [],
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    usage: {
      totalTokens: 0,
      totalLimit: totalLimitTokens,
      totalCost: 0,
      currentBalance: balanceCents,
      llmUsage: [],
    },
  };
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.billingData = null;
  mocks.isLoading = false;
  mocks.isError = false;
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('PlanBadge — loading state', () => {
  it('renders a skeleton pulse element when isLoading is true', () => {
    mocks.isLoading = true;
    const { container } = render(<PlanBadge />);
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('does not render a clickable button when isLoading', () => {
    mocks.isLoading = true;
    render(<PlanBadge />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('skeleton has aria-hidden="true"', () => {
    mocks.isLoading = true;
    const { container } = render(<PlanBadge />);
    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('PlanBadge — error state', () => {
  it('renders nothing when isError is true', () => {
    mocks.isError = true;
    const { container } = render(<PlanBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when billing data is null and not loading', () => {
    mocks.billingData = null;
    const { container } = render(<PlanBadge />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Free tier
// ---------------------------------------------------------------------------

describe('PlanBadge — free tier', () => {
  beforeEach(() => {
    mocks.billingData = makeBilling('free', 0, 0);
  });

  it('renders "Free · Upgrade →" label', () => {
    render(<PlanBadge />);
    expect(screen.getByRole('button', { name: /Free/ })).toBeInTheDocument();
    expect(screen.getByRole('button').textContent).toBe('Free · Upgrade →');
  });

  it('renders tooltip text with upgrade CTA', () => {
    render(<PlanBadge />);
    expect(screen.getByTestId('tooltip-content').textContent).toBe(
      'Upgrade to Pro for more credits',
    );
  });

  it('aria-label contains plan name and upgrade CTA', () => {
    render(<PlanBadge />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toContain('Free');
    expect(btn.getAttribute('aria-label')).toContain('Upgrade to Pro for more credits');
  });

  it('applies freePillClasses (bg-primary/10)', () => {
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-primary/10');
  });

  it('does NOT apply green/amber/red color classes for free tier', () => {
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).not.toContain('bg-emerald');
    expect(btn?.className).not.toContain('bg-amber');
    expect(btn?.className).not.toContain('bg-red');
  });

  it('navigates to /dashboard/billing on click', () => {
    render(<PlanBadge />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/billing');
  });
});

// ---------------------------------------------------------------------------
// Paid tier — color variants
// ---------------------------------------------------------------------------

describe('PlanBadge — paid tier color variants', () => {
  it('applies green variant when > 50% remaining', () => {
    // balance=600, limit=100000 → allocatedCents = 100000/100 = 1000
    // pctRemaining = round(600/1000 * 100) = 60 → green
    mocks.billingData = makeBilling('pro', 600, 100_000);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-emerald-500/10');
    expect(btn?.className).toContain('text-emerald-700');
  });

  it('applies yellow/amber variant when exactly 50% remaining', () => {
    // balance=500, allocatedCents=1000 → pctRemaining=50 → yellow (>= 25 and <= 50)
    mocks.billingData = makeBilling('pro', 500, 100_000);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-amber-500/10');
    expect(btn?.className).toContain('text-amber-700');
  });

  it('applies yellow/amber variant when 25% remaining', () => {
    // balance=250, allocatedCents=1000 → pctRemaining=25 → yellow
    mocks.billingData = makeBilling('pro', 250, 100_000);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-amber-500/10');
  });

  it('applies red variant when < 25% remaining', () => {
    // balance=240, allocatedCents=1000 → pctRemaining=24 → red
    mocks.billingData = makeBilling('pro', 240, 100_000);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-red-500/10');
    expect(btn?.className).toContain('text-red-700');
  });

  it('applies red variant when 0% remaining', () => {
    mocks.billingData = makeBilling('pro', 0, 100_000);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-red-500/10');
  });

  it('falls back to red (0%) when totalLimit is 0 (no allocation)', () => {
    // allocatedCents = round(0/100) = 0 → pctRemaining = 0 → red
    mocks.billingData = makeBilling('pro', 0, 0);
    const { container } = render(<PlanBadge />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-red-500/10');
  });
});

// ---------------------------------------------------------------------------
// Paid tier — label and tooltip
// ---------------------------------------------------------------------------

describe('PlanBadge — paid tier label and tooltip', () => {
  it('shows "Pro · $6.00 left" for pro plan with 600 cents balance', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000);
    render(<PlanBadge />);
    expect(screen.getByRole('button').textContent).toBe('Pro · $6.00 left');
  });

  it('shows "Enterprise · $0.00 left" when balance is 0 cents', () => {
    mocks.billingData = makeBilling('enterprise', 0, 100_000);
    render(<PlanBadge />);
    expect(screen.getByRole('button').textContent).toBe('Enterprise · $0.00 left');
  });

  it('tooltip shows "$X.XX credits remaining · Resets {date}"', () => {
    // Use noon local time to avoid UTC offset shifting the displayed date
    mocks.billingData = makeBilling('pro', 1234, 100_000, '2026-04-01T12:00:00');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent;
    expect(tooltip).toContain('$12.34 credits remaining');
    expect(tooltip).toContain('Resets Apr 1');
  });

  it('aria-label contains credits remaining and reset date', () => {
    mocks.billingData = makeBilling('pro', 500, 100_000, '2026-04-15T12:00:00');
    render(<PlanBadge />);
    const ariaLabel = screen.getByRole('button').getAttribute('aria-label') ?? '';
    expect(ariaLabel).toContain('$5.00 credits remaining');
    expect(ariaLabel).toContain('Resets Apr 15');
  });

  it('shows correct label for "max" plan (PLAN_LABELS fallback)', () => {
    // "max" is not a BillingPlan type but is handled via the | 'max' union
    mocks.billingData = makeBilling('max', 800, 100_000);
    render(<PlanBadge />);
    expect(screen.getByRole('button').textContent).toBe('Max · $8.00 left');
  });

  it('shows "Free" label for unknown plan (PLAN_LABELS fallback to "Free")', () => {
    // plan not in PLAN_LABELS → planLabel defaults to 'Free'
    mocks.billingData = makeBilling('unknown_plan', 0, 0);
    render(<PlanBadge />);
    // isFree = (plan === 'free') is false, but planLabel fallback is 'Free'
    // pillLabel = 'Free · $0.00 left'
    expect(screen.getByRole('button').textContent).toContain('Free');
  });
});

// ---------------------------------------------------------------------------
// formatResetDate edge cases
// ---------------------------------------------------------------------------

describe('PlanBadge — formatResetDate edge cases', () => {
  it('formats a valid ISO date as "Mon D" (e.g. "Mar 1")', () => {
    // Use noon local time to avoid UTC offset shifting the displayed day
    mocks.billingData = makeBilling('pro', 600, 100_000, '2026-03-01T12:00:00');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent ?? '';
    expect(tooltip).toContain('Resets Mar 1');
  });

  it('formats a valid ISO date in December correctly', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000, '2026-12-25T12:00:00');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent ?? '';
    expect(tooltip).toContain('Resets Dec 25');
  });

  it('returns "next month" for an invalid date string', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000, 'not-a-date');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent ?? '';
    expect(tooltip).toContain('next month');
  });

  it('returns "next month" for an empty string date', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000, '');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent ?? '';
    expect(tooltip).toContain('next month');
  });

  it('returns "next month" for "Invalid Date" ISO string', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000, 'Invalid Date');
    render(<PlanBadge />);
    const tooltip = screen.getByTestId('tooltip-content').textContent ?? '';
    expect(tooltip).toContain('next month');
  });
});

// ---------------------------------------------------------------------------
// Click navigation
// ---------------------------------------------------------------------------

describe('PlanBadge — click navigation', () => {
  it('navigates to /dashboard/billing when paid-plan pill is clicked', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000);
    render(<PlanBadge />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/billing');
  });

  it('navigates to /dashboard/billing on a single click (no double-nav)', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000);
    render(<PlanBadge />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('button has type="button" to prevent accidental form submission', () => {
    mocks.billingData = makeBilling('pro', 600, 100_000);
    render(<PlanBadge />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'button');
  });
});
