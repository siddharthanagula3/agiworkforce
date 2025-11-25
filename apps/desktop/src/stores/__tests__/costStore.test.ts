import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useCostStore } from '../costStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

type TauriInvoke = (typeof import('@tauri-apps/api/core'))['invoke'];
type InvokeMock = Mock<Parameters<TauriInvoke>, ReturnType<TauriInvoke>>;

let invokeMock: InvokeMock;

beforeEach(async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  invokeMock = invoke as InvokeMock;
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

    await useCostStore.getState().loadAnalytics({ provider: 'openai', model: 'gpt-5.1' });
    expect(invokeMock).toHaveBeenCalledWith('chat_get_cost_analytics', {
      days: 30,
      provider: 'openai',
      model: 'gpt-5.1',
    });
    expect(useCostStore.getState().filters).toEqual({
      days: 30,
      provider: 'openai',
      model: 'gpt-5.1',
    });

    invokeMock.mockResolvedValue({
      timeseries: [],
      providers: [],
      top_conversations: [],
    });
    await useCostStore.getState().loadAnalytics({ provider: '', model: '' });
    expect(invokeMock).toHaveBeenLastCalledWith('chat_get_cost_analytics', {
      days: 30,
      provider: null,
      model: null,
    });
    expect(useCostStore.getState().filters).toEqual({ days: 30 });
  });

  it('updates monthly budget and refreshes overview', async () => {
    invokeMock.mockResolvedValueOnce(undefined); // chat_set_monthly_budget
    invokeMock.mockResolvedValueOnce({
      today_total: 1.25,
      month_total: 40.0,
      monthly_budget: 100,
      remaining_budget: 60,
    });

    await useCostStore.getState().setMonthlyBudget(100);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_set_monthly_budget', { amount: 100 });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'chat_get_cost_overview');
    expect(useCostStore.getState().overview?.monthly_budget).toBe(100);
  });
});
