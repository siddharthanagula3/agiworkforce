// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  analyticsGetUsageStats,
  analyticsGetFeatureUsage,
  analyticsGetMetricTrends,
  analyticsGetTimeSavedTrend,
  analyticsGetCostSavedTrend,
  analyticsGenerateWeeklyReport,
  analyticsGenerateMonthlyReport,
} from '../api/analytics';
import type { UsageStats, FeatureUsageEntry, TrendPoint } from '../api/analytics';
import { ErrorSeverity, errorTracking } from '../services/errorTracking';

interface AnalyticsState {
  usageStats: UsageStats | null;
  featureUsage: FeatureUsageEntry[];
  metricTrends: Record<string, TrendPoint[]>;
  weeklyReport: string | null;
  monthlyReport: string | null;
  loadingUsageStats: boolean;
  loadingFeatureUsage: boolean;
  loadingTrends: boolean;
  loadingWeeklyReport: boolean;
  loadingMonthlyReport: boolean;
  error: string | null;
}

interface AnalyticsActions {
  fetchUsageStats: () => Promise<void>;
  fetchFeatureUsage: () => Promise<void>;
  fetchMetricTrends: (metric: string, days: number) => Promise<void>;
  fetchRoiTrends: (days: number) => Promise<void>;
  fetchWeeklyReport: () => Promise<void>;
  fetchMonthlyReport: () => Promise<void>;
  fetchAllAnalytics: (trendDays?: number) => Promise<void>;
  clearError: () => void;
}

export type AnalyticsStore = AnalyticsState & AnalyticsActions;

const MAX_TREND_METRICS = 20;

export const useAnalyticsStore = create<AnalyticsStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        usageStats: null,
        featureUsage: [],
        metricTrends: {},
        weeklyReport: null,
        monthlyReport: null,
        loadingUsageStats: false,
        loadingFeatureUsage: false,
        loadingTrends: false,
        loadingWeeklyReport: false,
        loadingMonthlyReport: false,
        error: null,

        fetchUsageStats: async () => {
          set({ loadingUsageStats: true, error: null });
          try {
            const stats = await analyticsGetUsageStats();
            set({ usageStats: stats });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.MEDIUM,
            });
          } finally {
            set({ loadingUsageStats: false });
          }
        },

        fetchFeatureUsage: async () => {
          set({ loadingFeatureUsage: true, error: null });
          try {
            const entries = await analyticsGetFeatureUsage();
            set({ featureUsage: entries });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.MEDIUM,
            });
          } finally {
            set({ loadingFeatureUsage: false });
          }
        },

        fetchMetricTrends: async (metric: string, days: number) => {
          set({ loadingTrends: true, error: null });
          try {
            const points = await analyticsGetMetricTrends(metric, days);
            set((state) => {
              const keys = Object.keys(state.metricTrends);
              if (keys.length >= MAX_TREND_METRICS && !state.metricTrends[metric]) {
                const oldest = keys[0];
                if (oldest) {
                  delete state.metricTrends[oldest];
                }
              }
              state.metricTrends[metric] = points;
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.LOW,
            });
          } finally {
            set({ loadingTrends: false });
          }
        },

        fetchRoiTrends: async (days: number) => {
          set({ loadingTrends: true, error: null });
          try {
            const [timeSaved, costSaved] = await Promise.all([
              analyticsGetTimeSavedTrend(days),
              analyticsGetCostSavedTrend(days),
            ]);
            set((state) => {
              state.metricTrends['time_saved'] = timeSaved;
              state.metricTrends['cost_saved'] = costSaved;
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.LOW,
            });
          } finally {
            set({ loadingTrends: false });
          }
        },

        fetchWeeklyReport: async () => {
          set({ loadingWeeklyReport: true, error: null });
          try {
            const report = await analyticsGenerateWeeklyReport();
            set({ weeklyReport: report });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.LOW,
            });
          } finally {
            set({ loadingWeeklyReport: false });
          }
        },

        fetchMonthlyReport: async () => {
          set({ loadingMonthlyReport: true, error: null });
          try {
            const report = await analyticsGenerateMonthlyReport();
            set({ monthlyReport: report });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({ error: message });
            errorTracking.captureError(error instanceof Error ? error : new Error(message), {
              component: 'analyticsStore',
              severity: ErrorSeverity.LOW,
            });
          } finally {
            set({ loadingMonthlyReport: false });
          }
        },

        fetchAllAnalytics: async (trendDays = 30) => {
          const { fetchUsageStats, fetchFeatureUsage, fetchRoiTrends } = get();
          await Promise.all([fetchUsageStats(), fetchFeatureUsage(), fetchRoiTrends(trendDays)]);
        },

        clearError: () => {
          set({ error: null });
        },
      })),
    ),
    { name: 'AnalyticsStore', enabled: import.meta.env.DEV },
  ),
);
