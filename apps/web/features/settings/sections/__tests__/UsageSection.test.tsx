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

  it('never renders internal credit, dollar, or token balances', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText(managedUsageBucketLabel('session'));
    expect(screen.queryByText(/monthly credit allowance/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/tokens today/i)).toBeNull();
    expect(screen.queryByText(/credits/i)).toBeNull();
  });

  it('drops the plan chip, already shown on Billing', async () => {
    render(React.createElement(UsageSection));
    await screen.findByText('Plan usage limits');
    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.queryByText('Pro')).toBeNull();
  });
});
