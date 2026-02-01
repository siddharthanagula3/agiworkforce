/**
 * useAnalytics Hook
 *
 * Provides a unified interface for fetching and managing analytics data
 * with built-in caching, auto-refresh, and error handling.
 *
 * Features:
 * - Fetches usage analytics, cost data, and ROI metrics
 * - Auto-refreshes every 60 seconds when enabled
 * - Caches data to prevent redundant API calls
 * - Handles loading and error states
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../lib/tauri-mock';
import { useBillingUsageStore } from '../stores/billingUsage';
import { useROIStore } from '../components/ROIDashboard/roiStore';
import type { CostAnalyticsResponse, CostOverviewResponse } from '../types/chat';
import type { AllTimeStats, DayStats, WeekStats, MonthStats, ChartDataPoint } from '../types/roi';
import type {
  UsageStats as AnalyticsUsageStats,
  AppMetrics,
  SystemMetrics,
} from '../types/analytics';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Auto-refresh interval in milliseconds (60 seconds)
const AUTO_REFRESH_INTERVAL = 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface AnalyticsData {
  // Cost data
  costOverview: CostOverviewResponse | null;
  costAnalytics: CostAnalyticsResponse | null;

  // ROI data
  todayStats: DayStats | null;
  weekStats: WeekStats | null;
  monthStats: MonthStats | null;
  allTimeStats: AllTimeStats | null;

  // Usage data
  usageStats: AnalyticsUsageStats | null;
  appMetrics: AppMetrics | null;
  systemMetrics: SystemMetrics | null;

  // Trends
  timeSavedTrend: ChartDataPoint[];
  costSavedTrend: ChartDataPoint[];
}

interface UseAnalyticsOptions {
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
  /** Auto-refresh interval in ms (default: 60000) */
  refreshInterval?: number;
  /** Skip initial fetch (default: false) */
  skipInitialFetch?: boolean;
}

interface UseAnalyticsReturn {
  // Data
  data: AnalyticsData;

  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  refreshCostData: () => Promise<void>;
  refreshROIData: () => Promise<void>;
  refreshUsageData: () => Promise<void>;

  // Computed values
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  totalAutomationsRun: number;
  estimatedMonthlySavings: number;

  // Status
  lastUpdated: Date | null;
  isConnected: boolean;
}

/**
 * Check if a cache entry is still valid
 */
function isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

/**
 * Hook for fetching and managing analytics data
 */
export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsReturn {
  const {
    autoRefresh = true,
    refreshInterval = AUTO_REFRESH_INTERVAL,
    skipInitialFetch = false,
  } = options;

  // Local state
  const [isLoading, setIsLoading] = useState(!skipInitialFetch);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Cache refs
  const costOverviewCache = useRef<CacheEntry<CostOverviewResponse> | null>(null);
  const costAnalyticsCache = useRef<CacheEntry<CostAnalyticsResponse> | null>(null);
  const trendsCache = useRef<CacheEntry<{
    timeSaved: ChartDataPoint[];
    costSaved: ChartDataPoint[];
  }> | null>(null);

  // Store references
  const billingStore = useBillingUsageStore();
  const roiStore = useROIStore();

  // Computed data from stores
  const data: AnalyticsData = useMemo(
    () => ({
      costOverview: billingStore.costOverview,
      costAnalytics: billingStore.costAnalytics,
      todayStats: roiStore.todayStats,
      weekStats: roiStore.weekStats,
      monthStats: roiStore.monthStats,
      allTimeStats: roiStore.allTimeStats,
      usageStats: billingStore.analyticsUsageStats,
      appMetrics: billingStore.appMetrics,
      systemMetrics: billingStore.systemMetrics,
      timeSavedTrend: trendsCache.current?.data.timeSaved ?? [],
      costSavedTrend: trendsCache.current?.data.costSaved ?? [],
    }),
    [
      billingStore.costOverview,
      billingStore.costAnalytics,
      billingStore.analyticsUsageStats,
      billingStore.appMetrics,
      billingStore.systemMetrics,
      roiStore.todayStats,
      roiStore.weekStats,
      roiStore.monthStats,
      roiStore.allTimeStats,
    ],
  );

  // Computed values
  const totalTimeSavedHours = useMemo(() => {
    return roiStore.allTimeStats?.totalTimeSavedHours ?? 0;
  }, [roiStore.allTimeStats]);

  const totalCostSavedUsd = useMemo(() => {
    return roiStore.allTimeStats?.totalCostSavedUsd ?? 0;
  }, [roiStore.allTimeStats]);

  const totalAutomationsRun = useMemo(() => {
    return roiStore.allTimeStats?.automationsRun ?? 0;
  }, [roiStore.allTimeStats]);

  const estimatedMonthlySavings = useMemo(() => {
    const monthStats = roiStore.monthStats;
    if (!monthStats) return 0;
    // Project current month's savings to full month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const projectionFactor = daysInMonth / dayOfMonth;
    return monthStats.totalCostSavedUsd * projectionFactor;
  }, [roiStore.monthStats]);

  // Fetch cost data
  const refreshCostData = useCallback(async () => {
    try {
      // Check cache first
      if (isCacheValid(costOverviewCache.current) && isCacheValid(costAnalyticsCache.current)) {
        return;
      }

      await Promise.all([billingStore.loadCostOverview(), billingStore.loadCostAnalytics()]);

      // Update cache
      if (billingStore.costOverview) {
        costOverviewCache.current = {
          data: billingStore.costOverview,
          timestamp: Date.now(),
        };
      }
      if (billingStore.costAnalytics) {
        costAnalyticsCache.current = {
          data: billingStore.costAnalytics,
          timestamp: Date.now(),
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load cost data';
      console.error('Failed to refresh cost data:', message);
      throw new Error(message);
    }
  }, [billingStore]);

  // Fetch ROI data
  const refreshROIData = useCallback(async () => {
    try {
      await roiStore.fetchStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ROI data';
      console.error('Failed to refresh ROI data:', message);
      throw new Error(message);
    }
  }, [roiStore]);

  // Fetch usage/system data
  const refreshUsageData = useCallback(async () => {
    try {
      await billingStore.refreshAllMetrics();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load usage data';
      console.error('Failed to refresh usage data:', message);
      throw new Error(message);
    }
  }, [billingStore]);

  // Fetch trends data
  const refreshTrendsData = useCallback(async () => {
    try {
      if (isCacheValid(trendsCache.current)) {
        return;
      }

      const [timeSavedTrend, costSavedTrend] = await Promise.all([
        invoke<ChartDataPoint[]>('analytics_get_time_saved_trend', { days: 30 }).catch(() => []),
        invoke<ChartDataPoint[]>('analytics_get_cost_saved_trend', { days: 30 }).catch(() => []),
      ]);

      trendsCache.current = {
        data: {
          timeSaved: timeSavedTrend,
          costSaved: costSavedTrend,
        },
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error('Failed to refresh trends data:', err);
      // Don't throw - trends are optional
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      // Clear caches to force fresh data
      costOverviewCache.current = null;
      costAnalyticsCache.current = null;
      trendsCache.current = null;

      await Promise.all([
        refreshCostData(),
        refreshROIData(),
        refreshUsageData(),
        refreshTrendsData(),
      ]);

      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh analytics data';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshCostData, refreshROIData, refreshUsageData, refreshTrendsData]);

  // Initial fetch
  useEffect(() => {
    if (skipInitialFetch) {
      setIsLoading(false);
      return;
    }

    const initialFetch = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          refreshCostData(),
          refreshROIData(),
          refreshUsageData(),
          refreshTrendsData(),
        ]);
        setLastUpdated(new Date());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load analytics data';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void initialFetch();
  }, [skipInitialFetch, refreshCostData, refreshROIData, refreshUsageData, refreshTrendsData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      void refresh();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, refresh]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
    refreshCostData,
    refreshROIData,
    refreshUsageData,
    totalTimeSavedHours,
    totalCostSavedUsd,
    totalAutomationsRun,
    estimatedMonthlySavings,
    lastUpdated,
    isConnected: roiStore.isConnected,
  };
}

/**
 * Hook for fetching realtime analytics updates
 * Subscribes to live events and updates automatically
 */
export function useRealtimeAnalytics() {
  const roiStore = useROIStore();

  useEffect(() => {
    roiStore.subscribeToLiveUpdates();

    return () => {
      roiStore.unsubscribeFromLiveUpdates();
    };
  }, [roiStore]);

  return {
    isConnected: roiStore.isConnected,
    lastUpdate: roiStore.lastUpdate,
    updateCount: roiStore.updateCount,
    todayStats: roiStore.todayStats,
  };
}

/**
 * Hook for analytics summary - lightweight version for dashboards
 */
export function useAnalyticsSummary() {
  const billingStore = useBillingUsageStore();
  const roiStore = useROIStore();

  const summary = useMemo(() => {
    const costOverview = billingStore.costOverview;
    const todayStats = roiStore.todayStats;
    const allTimeStats = roiStore.allTimeStats;

    return {
      // Today's usage
      todayUsage: costOverview?.today_total ?? 0,
      monthlyUsage: costOverview?.month_total ?? 0,
      monthlyBudget: costOverview?.monthly_budget ?? null,
      budgetRemaining: costOverview?.remaining_budget ?? null,

      // ROI metrics
      timeSavedToday: todayStats?.totalTimeSavedHours ?? 0,
      costSavedToday: todayStats?.totalCostSavedUsd ?? 0,
      automationsToday: todayStats?.automationsRun ?? 0,
      qualityScore: todayStats?.avgQualityScore ?? 0,

      // All time
      totalTimeSaved: allTimeStats?.totalTimeSavedHours ?? 0,
      totalCostSaved: allTimeStats?.totalCostSavedUsd ?? 0,
      totalAutomations: allTimeStats?.automationsRun ?? 0,
      milestonesAchieved: allTimeStats?.milestonesAchieved ?? 0,
    };
  }, [billingStore.costOverview, roiStore.todayStats, roiStore.allTimeStats]);

  return summary;
}
