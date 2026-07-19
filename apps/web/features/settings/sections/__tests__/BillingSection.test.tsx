import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: {
        tier: 'pro',
        display_name: 'Pro',
        status: 'active',
        current_period_end: 1_800_000_000,
      },
      creditBalance_cents: 1_200,
      dailyUsage_cents: 300,
      dailyLimit_cents: 500,
    }),
}));

import { BillingSection } from '../BillingSection';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('BillingSection', () => {
  it('shows public relative usage copy without private ledger values', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);

    render(<BillingSection />);

    expect(screen.getByText('5x more usage than Basic')).toBeTruthy();
    expect(screen.queryByText('Credit balance')).toBeNull();
    expect(screen.queryByText("Today's usage")).toBeNull();
    expect(screen.queryByText('$12.00')).toBeNull();
    expect(screen.queryByText('$3.00')).toBeNull();
  });
});
