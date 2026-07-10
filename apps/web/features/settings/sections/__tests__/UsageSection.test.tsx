/**
 * UsageSection.test.tsx
 *
 * Guards the usage-ceiling fix (2026-07): the "Monthly credit allowance" and
 * the %-used bars must be computed against the tier's REAL included budget
 * (billing-catalog getPlanUsageBudgetCents — Pro = $10/mo), not the raw ledger
 * `credits_allocated_cents`. A seeded/large allocation ($1,000,000 in QA) made
 * every bar read a permanent 0%.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', () => ({
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

// Billing store not hydrated → tier comes from /api/usage.plan_tier.
vi.mock('@/stores/unified/auth', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) => selector({ subscription: undefined }),
}));

import { UsageSection } from '../UsageSection';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/usage/analytics')) {
      return {
        ok: true,
        json: async () => ({
          stats: {
            sessions_count: 159,
            today_cost: 0,
            today_tokens: 0,
            week_cost: 0,
            month_cost: 500,
            total_tokens: 0,
          },
        }),
      } as Response;
    }
    // /api/usage — a Pro account with a hugely-seeded ledger allocation and $5 used.
    return {
      ok: true,
      json: async () => ({
        plan_tier: 'pro',
        credits_allocated_cents: 100_000_000, // $1,000,000 seed — must NOT be the ceiling
        credits_used_cents: 500, // $5.00 used
        credits_remaining_cents: 99_999_500,
        usage_percentage: 0, // server % vs the $1M seed → 0
        period_end: null,
        daily_used_cents: 0,
        daily_limit_cents: 0,
        subscription_status: 'active',
      }),
    } as Response;
  }) as unknown as typeof fetch;
});

describe('UsageSection — usage ceiling comes from the tier budget, not the ledger seed', () => {
  it('shows the Pro included budget ($10.00) as the allowance, not $1,000,000', async () => {
    render(React.createElement(UsageSection));
    // Pro budget = $10.00 (getPlanUsageBudgetCents('pro') = 1000 cents).
    expect(await screen.findByText('$10.00')).toBeTruthy();
    expect(screen.queryByText('$1,000,000.00')).toBeNull();
  });

  it('computes %-used against the real budget ($5 of $10 = 50%), not the seed (0%)', async () => {
    render(React.createElement(UsageSection));
    // "This month" bar: 500 / 1000 = 50% used.
    expect(await screen.findByText('50% used')).toBeTruthy();
  });
});
