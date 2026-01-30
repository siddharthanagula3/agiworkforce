import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useBillingUsageStore } from '../billingUsage';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../services/supabaseAuth', () => ({
  supabaseAuth: {
    getUser: vi.fn(() => ({ id: 'test-user-id', email: 'test@example.com' })),
    onAuthStateChange: vi.fn(() => vi.fn()),
    checkSession: vi.fn(),
  },
}));

vi.mock('../../services/analytics', () => ({
  analytics: {
    getConfig: vi.fn(() => ({ enabled: false })),
    getPrivacyConsent: vi.fn(() => null),
    updateConfig: vi.fn(),
    updatePrivacyConsent: vi.fn(),
    exportData: vi.fn(),
    deleteAllData: vi.fn(),
    track: vi.fn(),
  },
}));

vi.mock('../../services/errorTracking', () => ({
  ErrorSeverity: { MEDIUM: 'medium', HIGH: 'high' },
  errorTracking: {
    captureError: vi.fn(),
    initialize: vi.fn(),
  },
}));

vi.mock('../../services/featureFlags', () => ({
  featureFlags: {
    isEnabled: vi.fn(() => false),
    trackFeatureUsage: vi.fn(),
  },
}));

vi.mock('../../services/performance', () => ({
  performanceMonitor: {
    getSystemMetrics: vi.fn(),
    getAppMetrics: vi.fn(),
  },
}));

// AUDIT-P3-TEST-TYPE: Use Mock type with explicit function signature for better type safety
type InvokeMock = Mock<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>;

let invokeMock: InvokeMock;

beforeEach(async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  // AUDIT-P3-TEST-TYPE: Cast is necessary here as the mock module returns vi.fn()
  invokeMock = invoke as InvokeMock;
  invokeMock.mockReset();

  useBillingUsageStore.setState({
    costOverview: null,
    costAnalytics: null,
    costFilters: { days: 30 },
    loadingCostOverview: false,
    loadingCostAnalytics: false,
    costError: null,
  });
});

describe('useBillingUsageStore (cost functionality)', () => {
  it('loads analytics with normalized filters', async () => {
    invokeMock.mockResolvedValue({
      timeseries: [],
      providers: [],
      top_conversations: [],
    });

    await useBillingUsageStore
      .getState()
      .loadCostAnalytics({ provider: 'openai', model: 'gpt-5.2' });
    expect(invokeMock).toHaveBeenCalledWith('chat_get_cost_analytics', {
      userId: 'test-user-id',
      days: 30,
      provider: 'openai',
      model: 'gpt-5.2',
    });
    expect(useBillingUsageStore.getState().costFilters).toEqual({
      days: 30,
      provider: 'openai',
      model: 'gpt-5.2',
    });

    invokeMock.mockResolvedValue({
      timeseries: [],
      providers: [],
      top_conversations: [],
    });
    await useBillingUsageStore.getState().loadCostAnalytics({ provider: '', model: '' });
    expect(invokeMock).toHaveBeenLastCalledWith('chat_get_cost_analytics', {
      userId: 'test-user-id',
      days: 30,
      provider: null,
      model: null,
    });
    expect(useBillingUsageStore.getState().costFilters).toEqual({ days: 30 });
  });

  it('updates monthly budget and refreshes overview', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    invokeMock.mockResolvedValueOnce({
      today_total: 1.25,
      month_total: 40.0,
      monthly_budget: 100,
      remaining_budget: 60,
    });

    await useBillingUsageStore.getState().setMonthlyBudget(100);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'chat_set_monthly_budget', {
      userId: 'test-user-id',
      amount: 100,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'chat_get_cost_overview', {
      userId: 'test-user-id',
    });
    expect(useBillingUsageStore.getState().costOverview?.monthly_budget).toBe(100);
  });
});
