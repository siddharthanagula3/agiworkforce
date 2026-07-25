/** UsageSection must present subscription usage without exposing internal economics. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
        usage_reset_at: '2026-08-10T08:30:00.000Z',
        has_usage_remaining: true,
        period_start: '2026-07-10T08:30:00.000Z',
        period_end: '2026-08-10T08:30:00.000Z',
        subscription_status: 'active',
        session_usage_percentage: 60,
        session_reset_at: '2026-07-22T18:15:00.000Z',
        weekly_usage_percentage: 40,
        weekly_reset_at: '2026-07-25T12:00:00.000Z',
        flagship_weekly_usage_percentage: 95,
        flagship_weekly_reset_at: '2026-07-26T09:00:00.000Z',
      }),
    } as Response;
  }) as unknown as typeof fetch;
});

describe('UsageSection', () => {
  it('shows the rolling 5-hour, rolling 7-day, and account-month usage windows', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText('50% used')).toBeTruthy();
    expect(screen.getByText('Rolling 5 hours')).toBeTruthy();
    expect(screen.getByText('60% used')).toBeTruthy();
    expect(screen.getByText('Rolling 7 days')).toBeTruthy();
    expect(screen.getByText('40% used')).toBeTruthy();
    expect(screen.getByText('Account month')).toBeTruthy();
    // PAR-1 (CHANGED): the flagship window is now a fourth bar, so this count
    // moved from 3 to 4. A user at 95% on the expensive model family used to
    // see only the 50% aggregate and hit a wall with no warning.
    expect(screen.getAllByText(/capacity refreshes|resets/i)).toHaveLength(4);
  });

  it('renders the flagship weekly window the contract has always carried (PAR-1)', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText('Most capable models · 7 days')).toBeTruthy();
    expect(screen.getByText('95% used')).toBeTruthy();
  });

  // PAR-3: the reset detail must give a relative countdown, not only a machine
  // timestamp the user has to subtract from the current time themselves.
  it('shows a relative countdown alongside the absolute reset instant', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText('50% used');
    expect(screen.getAllByText(/capacity refreshes (in|now)/i).length).toBeGreaterThan(0);
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
    await screen.findByText('50% used');
    expect(screen.queryByText(/monthly credit allowance/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/tokens today/i)).toBeNull();
    expect(screen.queryByText(/credits/i)).toBeNull();
  });
});
