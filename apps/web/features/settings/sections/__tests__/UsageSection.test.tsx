/** UsageSection must present subscription usage without exposing internal economics. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', () => ({
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

// Billing store not hydrated → tier comes from /api/usage.plan_tier.
vi.mock('@shared/stores/web-auth-store', () => ({
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
    // /api/usage — public percentage/reset contract only.
    return {
      ok: true,
      json: async () => ({
        plan_tier: 'free',
        usage_percentage: 50,
        // Reset instants are RELATIVE to now. They used to be fixed 2026-07
        // literals, which quietly became past timestamps as real time passed —
        // and a past reset renders no countdown at all (formatUsageResetIn
        // returns null rather than a negative one), so the assertions below were
        // date-dependent. Relative offsets keep the four windows live forever.
        usage_reset_at: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
        has_usage_remaining: true,
        period_start: new Date(Date.now() - 25 * 24 * 60 * 60_000).toISOString(),
        period_end: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
        subscription_status: 'active',
        session_usage_percentage: 60,
        session_reset_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        weekly_usage_percentage: 40,
        weekly_reset_at: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
        flagship_weekly_usage_percentage: 95,
        flagship_weekly_reset_at: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
      }),
    } as Response;
  }) as unknown as typeof fetch;
});

describe('UsageSection', () => {
  it('shows all four usage windows using the shared vocabulary', async () => {
    // Labels and the remaining-phrasing come from @agiworkforce/types so this
    // surface cannot drift from mobile, desktop and the Chrome panel again —
    // the same four server buckets were previously named four different ways.
    render(React.createElement(UsageSection));
    // The fixture is percent USED; the meters state percent LEFT.
    // session 60->40, weekly 40->60, flagship 95->5, period 50->50.
    expect(await screen.findByText(managedUsageBucketLabel('session'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('weekly'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('weeklyFlagship'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('period'))).toBeTruthy();
    expect(screen.getAllByText('40% left').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60% left').length).toBeGreaterThan(0);
    expect(screen.getAllByText('50% left').length).toBeGreaterThan(0);
    // PAR-1: the flagship window is a fourth bar. A user at 95% on the expensive
    // model family used to see only the 50% aggregate and hit a wall with no warning.
    expect(screen.getAllByText(/resets in/i)).toHaveLength(4);
  });

  it('renders the flagship weekly window the contract has always carried (PAR-1)', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText(managedUsageBucketLabel('weeklyFlagship'))).toBeTruthy();
    expect(screen.getAllByText('5% left').length).toBeGreaterThan(0);
  });

  // PAR-3: the reset detail must give a relative countdown, not only a machine
  // timestamp the user has to subtract from the current time themselves.
  it('shows a relative countdown alongside the absolute reset instant', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    // Relative countdown from the shared formatter, PLUS the absolute instant
    // this surface keeps so a user can verify as well as plan.
    expect(screen.getAllByText(/resets in .*\(.*\)/i).length).toBeGreaterThan(0);
  });

  // PAR-4: 'Not loaded' was a literal that also survived a failed refresh.
  it('reports never-loaded and stale states honestly', async () => {
    global.fetch = vi.fn(
      async () => ({ ok: false, json: async () => ({}) }) as Response,
    ) as unknown as typeof fetch;
    render(React.createElement(UsageSection));
    expect(await screen.findByText(/Last updated: Never/)).toBeTruthy();
    expect(screen.queryByText(/Not loaded/)).toBeNull();
  });

  it('never renders internal credit, dollar, or token balances', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.queryByText(/monthly credit allowance/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/tokens today/i)).toBeNull();
    expect(screen.queryByText(/credits/i)).toBeNull();
  });
});
