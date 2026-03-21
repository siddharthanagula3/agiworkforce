/**
 * Analytics Store
 *
 * Manages usage statistics, feature usage breakdown, and metric trends.
 *
 * Related stores:
 *   - billingUsage.ts  — system/app metrics, ROI data, token budgets
 *   - roiStore.ts      — ROI reports, process/user/tool metrics
 *
 * This store is intentionally scoped to the three data types that belong on an
 * analytics dashboard but are not already owned by billingUsage or roiStore.
 *
 * Middleware: devtools(subscribeWithSelector(immer(...)))
 */

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

// ============================================================================
// Types
// ============================================================================

interface AnalyticsState {
  /** Aggregate usage statistics (DAU, MAU, session duration, etc.). */
  usageStats: UsageStats | null;
  /** Per-feature usage breakdown ordered by usage count. */
  featureUsage: FeatureUsageEntry[];
  /**
   * Cached trend series keyed by metric name.
   * e.g. { time_saved: TrendPoint[], cost_saved: TrendPoint[] }
   */
  metricTrends: Record<string, TrendPoint[]>;
  /** Generated report content — null until fetched. */
  weeklyReport: string | null;
  monthlyReport: string | null;
  /** Loading flags */
  loadingUsageStats: boolean;
  loadingFeatureUsage: boolean;
  loadingTrends: boolean;
  loadingWeeklyReport: boolean;
  loadingMonthlyReport: boolean;
  /** Last error message for display in UI */
  error: string | null;
}

interface AnalyticsActions {
  /** Fetch aggregate usage statistics from Rust backend. */
  fetchUsageStats: () => Promise<void>;
  /** Fetch per-feature usage breakdown. */
  fetchFeatureUsage: () => Promise<void>;
  /**
   * Fetch trend data for a named metric over N days.
   * Stores result under `metricTrends[metric]`.
   */
  fetchMetricTrends: (metric: string, days: number) => Promise<void>;
  /** Convenience: fetch both time_saved and cost_saved trends in parallel. */
  fetchRoiTrends: (days: number) => Promise<void>;
  /** Fetch a generated weekly report string. */
  fetchWeeklyReport: () => Promise<void>;
  /** Fetch a generated monthly report string. */
  fetchMonthlyReport: () => Promise<void>;
  /** Fetch usage stats, feature usage, and default ROI trends together. */
  fetchAllAnalytics: (trendDays?: number) => Promise<void>;
  /** Clear a stored error. */
  clearError: () => void;
}

export type AnalyticsStore = AnalyticsState & AnalyticsActions;

// Maximum number of trend series to keep in memory to prevent unbounded growth.
const MAX_TREND_METRICS = 20;

// ============================================================================
// Store
// ============================================================================

export const useAnalyticsStore = create<AnalyticsStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        // ── State ────────────────────────────────────────────────────────────
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

        // ── Actions ──────────────────────────────────────────────────────────

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
              // Evict the oldest entry when the cache is full.
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
