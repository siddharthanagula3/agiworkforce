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
        plan_tier: 'pro',
        usage_percentage: 50,
        usage_reset_at: null,
        period_end: null,
        subscription_status: 'active',
      }),
    } as Response;
  }) as unknown as typeof fetch;
});

describe('UsageSection', () => {
  it('shows the server usage percentage and reset state', async () => {
    render(React.createElement(UsageSection));
    expect(await screen.findByText('50% used')).toBeTruthy();
    expect(screen.getByText(/no reset scheduled/i)).toBeTruthy();
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
