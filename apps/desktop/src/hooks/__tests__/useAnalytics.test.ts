import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnalytics, useAnalyticsSummary, useRealtimeAnalytics } from '../useAnalytics';

// Mock the stores
vi.mock('../../stores/billingUsage', () => ({
  useBillingUsageStore: vi.fn(() => ({
    costOverview: null,
    costAnalytics: null,
    analyticsUsageStats: null,
    appMetrics: null,
    systemMetrics: null,
    loadCostOverview: vi.fn().mockResolvedValue(undefined),
    loadCostAnalytics: vi.fn().mockResolvedValue(undefined),
    refreshAllMetrics: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../components/ROIDashboard/roiStore', () => ({
  useROIStore: vi.fn(() => ({
    todayStats: null,
    weekStats: null,
    monthStats: null,
    allTimeStats: null,
    isConnected: false,
    lastUpdate: 0,
    updateCount: 0,
    fetchStats: vi.fn().mockResolvedValue(undefined),
    subscribeToLiveUpdates: vi.fn(),
    unsubscribeFromLiveUpdates: vi.fn(),
  })),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial state correctly', async () => {
    const { result } = renderHook(() => useAnalytics({ skipInitialFetch: true }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeDefined();
    expect(result.current.totalTimeSavedHours).toBe(0);
    expect(result.current.totalCostSavedUsd).toBe(0);
    expect(result.current.totalAutomationsRun).toBe(0);
  });

  it('should have refresh function', () => {
    const { result } = renderHook(() => useAnalytics({ skipInitialFetch: true }));

    expect(typeof result.current.refresh).toBe('function');
    expect(typeof result.current.refreshCostData).toBe('function');
    expect(typeof result.current.refreshROIData).toBe('function');
    expect(typeof result.current.refreshUsageData).toBe('function');
  });

  it('should handle auto refresh option', async () => {
    const { result } = renderHook(() =>
      useAnalytics({
        skipInitialFetch: true,
        autoRefresh: true,
        refreshInterval: 5000,
      }),
    );

    expect(result.current.isLoading).toBe(false);
  });
});

describe('useAnalyticsSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return summary data', () => {
    const { result } = renderHook(() => useAnalyticsSummary());

    expect(result.current).toEqual({
      todayUsage: 0,
      monthlyUsage: 0,
      monthlyBudget: null,
      budgetRemaining: null,
      timeSavedToday: 0,
      costSavedToday: 0,
      automationsToday: 0,
      qualityScore: 0,
      totalTimeSaved: 0,
      totalCostSaved: 0,
      totalAutomations: 0,
      milestonesAchieved: 0,
    });
  });
});

describe('useRealtimeAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return realtime data', () => {
    const { result } = renderHook(() => useRealtimeAnalytics());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastUpdate).toBe(0);
    expect(result.current.updateCount).toBe(0);
    expect(result.current.todayStats).toBeNull();
  });
});
