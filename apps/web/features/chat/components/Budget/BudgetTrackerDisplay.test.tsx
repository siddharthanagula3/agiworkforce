import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetTrackerDisplay } from './BudgetTrackerDisplay';

vi.mock('@shared/stores/billing-usage-store', () => ({
  useBillingUsageStore: (selector: (state: unknown) => unknown) =>
    selector({ sessionCost_cents: 25, dailyBudget_cents: 100 }),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({ activeConversationId: null, messagesByConversation: {} }),
}));

afterEach(() => vi.restoreAllMocks());

describe('BudgetTrackerDisplay', () => {
  it('renders percentages without credit, dollar, or token balances', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: {
          usage_percentage: 50,
          reset_at: '2026-08-01T00:00:00.000Z',
          seconds_until_reset: 86_400,
          has_usage_remaining: true,
        },
      }),
    } as Response);

    render(<BudgetTrackerDisplay showCreditBalance />);

    expect(await screen.findByText('50% used')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText(/tokens/i)).toBeNull();
    expect(screen.queryByText(/credit balance/i)).toBeNull();
  });
});
