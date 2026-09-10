import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@agiworkforce/ui', () => ({
  Progress: ({ value }: { value: number }) =>
    React.createElement('div', { 'data-testid': 'progress', 'data-value': value }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) => selector({ subscription: undefined }),
}));

import { UsageSection } from '../UsageSection';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// The pane reads GET /api/usage through useManagedUsageSummary. This used to
// stub /api/usage/analytics as well, a route the pane has never requested, and
// that stub was the only thing making the route look reachable. The stub now
// answers the one URL the pane asks for and refuses anything else, so a pane
// that starts calling somewhere new fails here rather than passing quietly.
beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith('/api/usage')) {
      throw new Error(`UsageSection requested an unexpected url: ${url}`);
    }
    return {
      ok: true,
      json: async () => ({
        plan_tier: 'free',
        usage_percentage: 50,
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
    render(React.createElement(UsageSection));
    expect(await screen.findByText(managedUsageBucketLabel('session'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('weekly'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('weeklyFlagship'))).toBeTruthy();
    expect(screen.getByText(managedUsageBucketLabel('period'))).toBeTruthy();
    expect(screen.getAllByText(/40% left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/60% left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50% left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/resets in/i)).toHaveLength(4);
    // The headline figure reads the same direction the bar fills.
    expect(screen.getAllByText('60% used').length).toBeGreaterThan(0);
    expect(screen.getAllByText('40% used').length).toBeGreaterThan(0);
  });

  it('renders the flagship weekly window the contract has always carried (PAR-1)', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText(managedUsageBucketLabel('weeklyFlagship'))).toBeTruthy();
    expect(screen.getAllByText(/\b5% left/).length).toBeGreaterThan(0);
  });

  it('shows a relative countdown alongside the absolute reset instant', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.getAllByText(/resets in .*\(.*\)/i).length).toBeGreaterThan(0);
  });

  it('reports never-loaded and stale states honestly', async () => {
    global.fetch = vi.fn(
      async () => ({ ok: false, json: async () => ({}) }) as Response,
    ) as unknown as typeof fetch;
    render(React.createElement(UsageSection));
    expect(await screen.findByText(/Last updated: Never/)).toBeTruthy();
    expect(screen.queryByText(/Not loaded/)).toBeNull();
  });

  it('never renders dollars, tokens, or internal ledger operands', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.queryByText(/monthly credit allowance/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/tokens today/i)).toBeNull();
    expect(screen.queryByText(/microusd|cents/i)).toBeNull();
  });

  it('drops the plan chip, already shown on Billing', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText('Plan usage limits');
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText('Pro')).toBeNull();
  });
});

describe('UsageSection stated in credits', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith('/api/usage')) {
        throw new Error(`UsageSection requested an unexpected url: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({
          plan_tier: 'pro',
          usage_percentage: 20,
          usage_reset_at: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
          has_usage_remaining: true,
          period_start: new Date(Date.now() - 25 * 24 * 60 * 60_000).toISOString(),
          period_end: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
          subscription_status: 'active',
          session_usage_percentage: 60,
          session_reset_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
          weekly_usage_percentage: 40,
          weekly_reset_at: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
          flagship_weekly_usage_percentage: 10,
          flagship_weekly_reset_at: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
          credits: {
            monthly: { allowance: 500, used: 100, remaining: 400, reset_at: null },
            weekly: { allowance: 125, used: 50, remaining: 75, reset_at: null },
            five_hour: { allowance: 25, used: 15, remaining: 10, reset_at: null },
            flagship_weekly: { allowance: 37.5, used: 3.75, remaining: 33.75, reset_at: null },
            purchased: { remaining: 423.7, overage_enabled: true },
          },
        }),
      } as Response;
    }) as unknown as typeof fetch;
  });

  it('leads with the plan allowance in credits', async () => {
    render(React.createElement(UsageSection));
    expect(
      await screen.findByText(
        'Pro · 500 credits/month · 125 credits/week · 25 credits per 5 hours',
      ),
    ).toBeTruthy();
  });

  it('labels every bar with the amount used, the allowance, and what is left', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.getAllByText(/Used 15 of 25 credits · 10 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 50 of 125 credits · 75 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 3.8 of 37.5 credits · 33.8 left/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Used 100 of 500 credits · 400 left/).length).toBeGreaterThan(0);
  });

  it('shows the purchased balance and no currency anywhere', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText('Balance 423.7 credits remaining')).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  it('keeps the bar fill on the percentage the server sends', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    const values = screen.getAllByTestId('progress').map((el) => el.getAttribute('data-value'));
    expect(values).toEqual(['60', '40', '10', '20']);
  });
});
