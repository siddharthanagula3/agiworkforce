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
          usage_visible: true,
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

  // Regression: this component was card-only, so ComposerFooter guarded it
  // behind `!inline` — and the only production mount always passes `inline`.
  // It therefore never rendered for a single user. The compact variant is what
  // actually ships now, so it needs its own coverage.
  it('renders a compact inline pill without the card chrome', () => {
    const { container } = render(<BudgetTrackerDisplay variant="compact" />);

    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByLabelText('Session budget: 25% used')).toBeTruthy();
    // The card wrapper must not be present in the composer's one-line row.
    expect(container.querySelector('.rounded-lg')).toBeNull();
  });

  it('shows an upgrade prompt instead of a meter when usage is internal (Free)', async () => {
    // Free's allowance is a cost control, not a published quantity: the server
    // sends usage_visible=false and no percentage, so there is nothing to render.
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: {
          usage_percentage: null,
          usage_visible: false,
          reset_at: '2026-08-01T00:00:00.000Z',
          seconds_until_reset: 86_400,
          has_usage_remaining: true,
        },
      }),
    } as Response);

    render(<BudgetTrackerDisplay showCreditBalance />);

    expect(await screen.findByText('Upgrade')).toBeInTheDocument();
    // The plan-allowance row is gone. The session budget meter is a separate,
    // local cost tracker and is deliberately untouched by this change.
    expect(screen.queryByText('Current period:')).toBeNull();
  });
});
