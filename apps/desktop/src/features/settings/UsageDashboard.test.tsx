import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREDITS_PER_USD, formatCredits } from '@agiworkforce/types';
import { formatProviderCostCredits, useBillingUsageStore } from '../../stores/billingUsage';
import type { ModelUsageStats } from '../../types/billing';
import { UsageDashboard, activityCells, favouriteModel, summarizeActivity } from './UsageDashboard';

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-03-20T09:00:00Z');

function day(offset: number): string {
  return new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);
}

function model(overrides: Partial<ModelUsageStats>): ModelUsageStats {
  return {
    model_id: 'fixture-model-a',
    model_name: 'Fixture Model A',
    provider: 'fixture',
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    request_count: 0,
    ...overrides,
  };
}

describe('summarizeActivity', () => {
  it('reports no activity for an empty timeseries', () => {
    expect(summarizeActivity([], NOW)).toEqual({
      activeDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      busiestDay: null,
    });
  });

  it('counts a running streak that ends today', () => {
    const summary = summarizeActivity(
      [
        { date: day(0), total_cost: 0.5 },
        { date: day(1), total_cost: 0.25 },
        { date: day(2), total_cost: 0.75 },
        { date: day(5), total_cost: 0.1 },
      ],
      NOW,
    );

    expect(summary.activeDays).toBe(4);
    expect(summary.currentStreak).toBe(3);
    expect(summary.longestStreak).toBe(3);
    expect(summary.busiestDay).toEqual({ date: day(2), cost: 0.75 });
  });

  it('drops the streak once the newest active day is older than yesterday', () => {
    const summary = summarizeActivity(
      [
        { date: day(2), total_cost: 1 },
        { date: day(3), total_cost: 1 },
      ],
      NOW,
    );

    expect(summary.currentStreak).toBe(0);
    expect(summary.longestStreak).toBe(2);
  });
});

describe('activityCells', () => {
  it('emits one ascending cell per day in the window, zero-filling idle days', () => {
    const cells = activityCells([{ date: day(1), total_cost: 2 }], NOW, 3);

    expect(cells.map((cell) => cell.date)).toEqual([day(2), day(1), day(0)]);
    expect(cells.map((cell) => cell.cost)).toEqual([0, 2, 0]);
  });
});

describe('favouriteModel', () => {
  it('picks the model with the most tokens', () => {
    const winner = model({ model_id: 'fixture-model-b', total_tokens: 900 });

    expect(favouriteModel([model({ total_tokens: 100 }), winner])).toBe(winner);
  });

  it('returns null with no model usage', () => {
    expect(favouriteModel([])).toBeNull();
  });
});

describe('UsageDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useBillingUsageStore.setState({
      loadCostOverview: vi.fn().mockResolvedValue(undefined),
      loadCostAnalytics: vi.fn().mockResolvedValue(undefined),
      costOverview: null,
      costAnalytics: null,
      usageStats: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an empty state in the resets section when no period is running', () => {
    useBillingUsageStore.setState({
      budget: { ...useBillingUsageStore.getState().budget, period: 'monthly', periodEnd: 0 },
    });

    render(<UsageDashboard />);

    expect(screen.getByRole('heading', { name: 'Usage limit resets' })).toBeInTheDocument();
    expect(screen.getByText(/No reset window is running/i)).toBeInTheDocument();
  });

  it('shows the time remaining in the resets section when a period is running', () => {
    useBillingUsageStore.setState({
      budget: {
        ...useBillingUsageStore.getState().budget,
        period: 'weekly',
        periodEnd: NOW + 2 * 3_600_000 + 30 * 60_000,
      },
    });

    render(<UsageDashboard />);

    expect(screen.getByText('weekly token budget')).toBeInTheDocument();
    expect(screen.getByText('in 2h 30m')).toBeInTheDocument();
  });

  it('renders streak, active-day and favourite-model aggregates from the cost timeseries', () => {
    useBillingUsageStore.setState({
      budget: { ...useBillingUsageStore.getState().budget, periodEnd: 0 },
      costAnalytics: {
        timeseries: [
          { date: day(0), total_cost: 0.2 },
          { date: day(1), total_cost: 0.4 },
        ],
        providers: [],
        top_conversations: [],
      },
      usageStats: {
        automations_executed: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        browser_sessions: 0,
        mcp_tool_calls: 0,
        llm_tokens_used: 1200,
        llm_input_tokens: 0,
        llm_output_tokens: 0,
        model_usage: [
          model({ model_id: 'fixture-model-a', model_name: 'Fixture A', total_tokens: 200 }),
          model({ model_id: 'fixture-model-b', model_name: 'Fixture B', total_tokens: 1000 }),
        ],
      },
    });

    render(<UsageDashboard />);

    const activity = within(screen.getByRole('region', { name: 'Activity' }));
    expect(activity.getByText('2 days')).toBeInTheDocument();
    expect(activity.getByText('2 / 30')).toBeInTheDocument();
    expect(activity.getByText('Fixture B')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Activity over the last 30 days/i }),
    ).toBeInTheDocument();
  });
});

describe('UsageDashboard in credits', () => {
  const overview = {
    today_total: 0.05,
    month_total: 1.2,
    monthly_budget: 5,
    remaining_budget: 3.8,
  };

  beforeEach(() => {
    useBillingUsageStore.setState({
      loadCostOverview: vi.fn().mockResolvedValue(undefined),
      loadCostAnalytics: vi.fn().mockResolvedValue(undefined),
      setMonthlyBudget: vi.fn().mockResolvedValue(undefined),
      budget: { ...useBillingUsageStore.getState().budget, enabled: false, currentUsage: 0 },
      costOverview: overview,
      costAnalytics: null,
      usageStats: {
        automations_executed: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        browser_sessions: 0,
        mcp_tool_calls: 0,
        llm_tokens_used: 500,
        llm_input_tokens: 0,
        llm_output_tokens: 0,
        model_usage: [
          model({ model_name: 'Fixture A', total_tokens: 500, cost_usd: 0.3, request_count: 2 }),
        ],
      },
    });
  });

  it('states spend, the monthly limit and per-model cost in credits, never dollars', () => {
    const { container } = render(<UsageDashboard />);

    expect(screen.getByText(formatProviderCostCredits(overview.today_total))).toBeInTheDocument();
    expect(
      screen.getByText(`${formatProviderCostCredits(overview.month_total)} used`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${Math.round((overview.month_total / overview.monthly_budget) * 100)}% of ${formatProviderCostCredits(overview.monthly_budget)}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${formatProviderCostCredits(overview.remaining_budget)} left this month`),
    ).toBeInTheDocument();
    expect(screen.getByText(`500 tok · ${formatCredits(0.3 * CREDITS_PER_USD)}`)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$');
  });

  it('takes the monthly limit in credits and removes it at zero', async () => {
    const setMonthlyBudget = vi.fn().mockResolvedValue(undefined);
    useBillingUsageStore.setState({ setMonthlyBudget });
    render(<UsageDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Adjust limit' }));
    const input = screen.getByLabelText('Monthly credit limit');
    expect(input).toHaveAttribute(
      'placeholder',
      String(overview.monthly_budget * CREDITS_PER_USD),
    );

    fireEvent.change(input, { target: { value: String(2 * CREDITS_PER_USD) } });
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    expect(setMonthlyBudget).toHaveBeenLastCalledWith(2 * CREDITS_PER_USD);

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust limit' }));
    fireEvent.change(screen.getByLabelText('Monthly credit limit'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    expect(setMonthlyBudget).toHaveBeenLastCalledWith(undefined);
  });
});
