/**
 * BudgetTrackerDisplay — component tests
 *
 * Covers:
 *  - Renders null when there is no usage data and showCreditBalance is false
 *  - Shows tokens used when > 0
 *  - Shows session cost when > 0
 *  - Shows daily remaining when daily budget is set
 *  - showCreditBalance=true renders loading state initially
 *  - showCreditBalance=true renders credit balance data after fetch resolves
 *  - showCreditBalance=true renders nothing extra when fetch fails
 *  - Negative monthly_remaining_cents gets destructive colour class
 *  - Hides daily limit row when daily_limit_cents is 0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── Store mocks ──────────────────────────────────────────────────────────────

// zustand persist — prevent localStorage writes
vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

// Mock billingUsage store
vi.mock('@/stores/unified/billingUsage', () => ({
  useBillingUsageStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      sessionCost_cents: 0,
      dailyBudget_cents: 0,
    };
    return selector ? selector(state) : state;
  }),
}));

// Mock chat-store
vi.mock('@features/chat/stores/chat-store', () => ({
  useChatStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      activeSessionId: 'session-1',
      messages: {
        'session-1': [],
      },
    };
    return selector ? selector(state) : state;
  }),
}));

import { BudgetTrackerDisplay } from '../BudgetTrackerDisplay';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';
import { useChatStore } from '@features/chat/stores/chat-store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockBillingStore(sessionCost_cents: number, dailyBudget_cents: number) {
  vi.mocked(useBillingUsageStore).mockImplementation((selector?: (s: any) => any) => {
    const state = { sessionCost_cents, dailyBudget_cents };
    return selector ? selector(state) : state;
  });
}

function mockChatStore(tokensUsed: number) {
  vi.mocked(useChatStore).mockImplementation((selector?: (s: any) => any) => {
    const state = {
      activeSessionId: 'session-1',
      messages: {
        'session-1': [
          {
            id: '1',
            role: 'assistant' as const,
            content: 'Hello',
            metadata: { tokensUsed },
          },
        ],
      },
    };
    return selector ? selector(state) : state;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BudgetTrackerDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no usage
    mockBillingStore(0, 0);
    mockChatStore(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Null render ──────────────────────────────────────────────────────────────

  describe('null render', () => {
    it('renders nothing when tokensUsed=0, sessionCost=0, showCreditBalance=false', () => {
      const { container } = render(<BudgetTrackerDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  // ── Token usage ───────────────────────────────────────────────────────────────

  describe('token usage display', () => {
    it('shows tokens used when tokensUsed > 0', () => {
      mockChatStore(1500);
      render(<BudgetTrackerDisplay />);
      expect(screen.getByText(/tokens used/i)).toBeInTheDocument();
      expect(screen.getByText('1,500')).toBeInTheDocument();
    });

    it('does not show tokens row when tokensUsed=0', () => {
      mockBillingStore(100, 0); // sessionCost >0 so component renders
      mockChatStore(0);
      render(<BudgetTrackerDisplay />);
      expect(screen.queryByText(/tokens used/i)).not.toBeInTheDocument();
    });
  });

  // ── Session cost ─────────────────────────────────────────────────────────────

  describe('session cost display', () => {
    it('shows session cost in dollars when sessionCost_cents > 0', () => {
      mockBillingStore(50, 0); // 50 cents = $0.50
      render(<BudgetTrackerDisplay />);
      expect(screen.getByText(/cost this session/i)).toBeInTheDocument();
      expect(screen.getByText(/\$0\.5000/)).toBeInTheDocument();
    });

    it('does not show session cost row when sessionCost_cents=0 but tokens > 0', () => {
      mockChatStore(200);
      render(<BudgetTrackerDisplay />);
      expect(screen.queryByText(/cost this session/i)).not.toBeInTheDocument();
    });
  });

  // ── Daily remaining ─────────────────────────────────────────────────────────

  describe('daily remaining tokens', () => {
    it('shows daily remaining when dailyBudget_cents > 0', () => {
      mockBillingStore(0, 1000); // dailyBudget set, but we need something to render
      mockChatStore(100); // tokens > 0 so component renders
      render(<BudgetTrackerDisplay />);
      expect(screen.getByText(/daily remaining/i)).toBeInTheDocument();
    });

    it('does not show daily remaining when dailyBudget_cents=0', () => {
      mockBillingStore(10, 0);
      render(<BudgetTrackerDisplay />);
      expect(screen.queryByText(/daily remaining/i)).not.toBeInTheDocument();
    });
  });

  // ── Credit balance (showCreditBalance=true) ──────────────────────────────────

  describe('credit balance', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch');
    });

    it('renders the component (not null) when showCreditBalance=true even with no usage', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);
      expect(screen.getByLabelText(/session budget/i)).toBeInTheDocument();

      // Wait for the async fetch to complete so no act() warnings leak between tests
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });
    });

    it('shows loading state while fetching credit balance', async () => {
      // Never resolves during this test
      vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));

      render(<BudgetTrackerDisplay showCreditBalance />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows credit balance data after successful fetch', async () => {
      const mockBalance = {
        credits: {
          monthly_remaining_cents: 4500,
          monthly_allocated_cents: 5000,
          daily_limit_cents: 1000,
          daily_remaining_cents: 800,
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBalance,
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(screen.getByText(/credit balance/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/monthly remaining/i)).toBeInTheDocument();
      expect(screen.getByText('$45.00')).toBeInTheDocument();
      expect(screen.getByText(/monthly allocated/i)).toBeInTheDocument();
      expect(screen.getByText('$50.00')).toBeInTheDocument();
    });

    it('shows daily remaining when daily_limit_cents > 0', async () => {
      const mockBalance = {
        credits: {
          monthly_remaining_cents: 4500,
          monthly_allocated_cents: 5000,
          daily_limit_cents: 1000,
          daily_remaining_cents: 800,
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBalance,
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(screen.getByText(/credit balance/i)).toBeInTheDocument();
      });

      expect(screen.getByText('$8.00')).toBeInTheDocument();
    });

    it('hides daily remaining row when daily_limit_cents=0', async () => {
      const mockBalance = {
        credits: {
          monthly_remaining_cents: 4500,
          monthly_allocated_cents: 5000,
          daily_limit_cents: 0,
          daily_remaining_cents: 0,
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBalance,
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(screen.getByText(/monthly remaining/i)).toBeInTheDocument();
      });

      // There should be no "Daily remaining" row in the credit balance section
      // (there could be one from billing store, but daily_limit_cents=0 skips credit one)
      const dailyRows = screen.queryAllByText(/daily remaining/i);
      // Only billing-store based row could appear, but dailyBudget_cents=0 so none
      expect(dailyRows).toHaveLength(0);
    });

    it('shows nothing extra when fetch returns non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        // loading should disappear after fetch resolves
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.queryByText(/credit balance/i)).not.toBeInTheDocument();
    });

    it('shows nothing extra when fetch throws', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.queryByText(/credit balance/i)).not.toBeInTheDocument();
    });

    it('fetches with credentials include', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/llm/v1/credits/balance',
          expect.objectContaining({ credentials: 'include' }),
        );
      });
    });

    it('applies destructive class when monthly_remaining_cents <= 0', async () => {
      const mockBalance = {
        credits: {
          monthly_remaining_cents: 0,
          monthly_allocated_cents: 5000,
          daily_limit_cents: 0,
          daily_remaining_cents: 0,
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBalance,
      } as Response);

      render(<BudgetTrackerDisplay showCreditBalance />);

      await waitFor(() => {
        expect(screen.getByText(/monthly remaining/i)).toBeInTheDocument();
      });

      // Find the monthly remaining value span
      const remainingValue = screen.getByText('$0.00');
      expect(remainingValue).toHaveClass('text-destructive');
    });

    it('does not fetch when showCreditBalance is false', () => {
      const fetchSpy = vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      // Need usage to render
      mockChatStore(100);
      render(<BudgetTrackerDisplay showCreditBalance={false} />);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
