import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useCostStore } from '../costStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../services/supabaseAuth', () => ({
  supabaseAuth: {
    getUser: vi.fn(() => ({ id: 'test-user-id', email: 'test@example.com' })),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  },
}));

type InvokeMock = MockInstance<(cmd: string, args?: unknown) => Promise<unknown>>;

let invokeMock: InvokeMock;

beforeEach(async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  invokeMock = invoke as unknown as InvokeMock;
  invokeMock.mockReset();

  useCostStore.setState({
    overview: null,
    analytics: null,
    filters: { days: 30 },
    loadingOverview: false,
    loadingAnalytics: false,
    error: null,
  });
});

describe('useCostStore', () => {
  it('loads analytics with normalized filters', async () => {
    invokeMock.mockResolvedValue({
      timeseries: [],
      providers: [],
      top_conversations: [],
    });

    await useCostStore.getState().loadAnalytics({ provider: 'openai', model: 'gpt-5.2' });
    expect(invokeMock).toHaveBeenCalledWith('chat_get_cost_analytics', {
      userId: 'test-user-id',
      days: 30,
      provider: 'openai',
      model: 'gpt-5.2',
    });
    expect(useCostStore.getState().filters).toEqual({
      days: 30,
      provider: 'openai',
      model: 'gpt-5.2',
    });

    invokeMock.mockResolvedValue({
      timeseries: [],
      providers: [],
      top_conversations: [],
    });
    await useCostStore.getState().loadAnalytics({ provider: '', model: '' });
    expect(invokeMock).toHaveBeenLastCalledWith('chat_get_cost_analytics', {
      userId: 'test-user-id',
      days: 30,
      provider: null,
      model: null,
    });
    expect(useCostStore.getState().filters).toEqual({ days: 30 });
  });

  it('updates monthly budget and refreshes overview', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    invokeMock.mockResolvedValueOnce({
      today_total: 1.25,
      month_total: 40.0,
      monthly_budget: 100,
      remaining_budget: 60,
    });

    await useCostStore.getState().setMonthlyBudget(100);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_set_monthly_budget', {
      userId: 'test-user-id',
      amount: 100,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'chat_get_cost_overview', {
      userId: 'test-user-id',
    });
    expect(useCostStore.getState().overview?.monthly_budget).toBe(100);
  });
});
