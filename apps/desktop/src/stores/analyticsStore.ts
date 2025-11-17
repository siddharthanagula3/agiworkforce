/**
 * Analytics Store
 *
 * Zustand store for analytics state management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  SystemMetrics,
  AppMetrics,
  UsageStats,
  FeatureUsageStats,
  AnalyticsConfig,
  PrivacyConsent,
} from '../types/analytics';
import { analytics } from '../services/analytics';
import { performanceMonitor } from '../services/performance';
import { errorTracking } from '../services/errorTracking';
import { featureFlags } from '../services/featureFlags';
import { invoke } from '@tauri-apps/api/core';

interface AnalyticsState {
  // Metrics
  systemMetrics: SystemMetrics | null;
  appMetrics: AppMetrics | null;
  usageStats: UsageStats | null;
  featureUsage: FeatureUsageStats[];

  // Configuration
  config: AnalyticsConfig;
  privacyConsent: PrivacyConsent | null;

  // Loading states
  isLoadingMetrics: boolean;
  isLoadingStats: boolean;

  // ROI Analytics State
  roiReport: any | null;
  processMetrics: any[];
  userMetrics: any[];
  toolMetrics: any[];
  trends: Record<string, any[]>;
  isLoadingROI: boolean;

  // Actions
  loadSystemMetrics: () => Promise<void>;
  loadAppMetrics: () => Promise<void>;
  loadUsageStats: () => Promise<void>;
  loadFeatureUsage: () => Promise<void>;
  refreshAllMetrics: () => Promise<void>;

  // Configuration actions
  updateConfig: (config: Partial<AnalyticsConfig>) => void;
  updatePrivacyConsent: (consent: PrivacyConsent) => void;

  // Data export/delete
  exportAnalyticsData: () => Promise<void>;
  deleteAllAnalyticsData: () => Promise<void>;

  // Feature flag actions
  isFeatureEnabled: (flagName: string) => boolean;
  trackFeatureUsage: (flagName: string) => void;

  // ROI Analytics Actions
  calculateROI: (startDate: number, endDate: number) => Promise<any>;
  loadProcessMetrics: (startDate: number, endDate: number) => Promise<any[]>;
  loadUserMetrics: (startDate: number, endDate: number) => Promise<any[]>;
  loadToolMetrics: (startDate: number, endDate: number) => Promise<any[]>;
  loadTrends: (metric: string, days: number) => Promise<any[]>;
  exportReport: (format: string, startDate: number, endDate: number) => Promise<string>;
  loadAllROIData: (startDate: number, endDate: number) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  immer((set, get) => ({
    // Initial state
    systemMetrics: null,
    appMetrics: null,
    usageStats: null,
    featureUsage: [],
    config: analytics.getConfig(),
    privacyConsent: analytics.getPrivacyConsent() || null,
    isLoadingMetrics: false,
    isLoadingStats: false,

    // Load system metrics
    loadSystemMetrics: async () => {
      set({ isLoadingMetrics: true });
      try {
        const metrics = await performanceMonitor.getSystemMetrics();
        set({ systemMetrics: metrics });
      } catch (error) {
        console.error('Failed to load system metrics:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'medium' as any,
          }
        );
      } finally {
        set({ isLoadingMetrics: false });
      }
    },

    // Load app metrics
    loadAppMetrics: async () => {
      set({ isLoadingMetrics: true });
      try {
        const metrics = await performanceMonitor.getAppMetrics();
        set({ appMetrics: metrics });
      } catch (error) {
        console.error('Failed to load app metrics:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'medium' as any,
          }
        );
      } finally {
        set({ isLoadingMetrics: false });
      }
    },

    // Load usage stats
    loadUsageStats: async () => {
      set({ isLoadingStats: true });
      try {
        // In a production system, this would query the backend
        // For now, we'll create mock data
        const stats: UsageStats = {
          dau: 0,
          mau: 0,
          total_users: 0,
          new_users_today: 0,
          new_users_this_week: 0,
          new_users_this_month: 0,
          avg_session_duration_ms: 0,
          total_events: 0,
          events_today: 0,
          retention_rate: 0,
        };
        set({ usageStats: stats });
      } catch (error) {
        console.error('Failed to load usage stats:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'medium' as any,
          }
        );
      } finally {
        set({ isLoadingStats: false });
      }
    },

    // Load feature usage
    loadFeatureUsage: async () => {
      try {
        // In a production system, this would query the backend
        // For now, we'll create mock data
        const usage: FeatureUsageStats[] = [
          {
            feature_name: 'parallel_execution',
            usage_count: 0,
            unique_users: 0,
            trend: 'stable',
          },
          {
            feature_name: 'browser_automation',
            usage_count: 0,
            unique_users: 0,
            trend: 'stable',
          },
          {
            feature_name: 'code_completion',
            usage_count: 0,
            unique_users: 0,
            trend: 'up',
          },
        ];
        set({ featureUsage: usage });
      } catch (error) {
        console.error('Failed to load feature usage:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'medium' as any,
          }
        );
      }
    },

    // Refresh all metrics
    refreshAllMetrics: async () => {
      const { loadSystemMetrics, loadAppMetrics, loadUsageStats, loadFeatureUsage } =
        get();
      await Promise.all([
        loadSystemMetrics(),
        loadAppMetrics(),
        loadUsageStats(),
        loadFeatureUsage(),
      ]);
    },

    // Update configuration
    updateConfig: (newConfig: Partial<AnalyticsConfig>) => {
      set((state) => {
        state.config = { ...state.config, ...newConfig };
      });
      analytics.updateConfig(newConfig);
    },

    // Update privacy consent
    updatePrivacyConsent: (consent: PrivacyConsent) => {
      set({ privacyConsent: consent });
      analytics.updatePrivacyConsent(consent);

      // Initialize error tracking if enabled
      if (consent.error_reporting_enabled) {
        errorTracking.initialize();
      }

      analytics.track('settings_changed', {
        setting_type: 'privacy_consent',
        analytics_enabled: consent.analytics_enabled,
        error_reporting_enabled: consent.error_reporting_enabled,
        performance_monitoring_enabled: consent.performance_monitoring_enabled,
      });
    },

    // Export analytics data
    exportAnalyticsData: async () => {
      try {
        await analytics.exportData();
        analytics.track('data_exported', {
          export_type: 'analytics',
        });
      } catch (error) {
        console.error('Failed to export analytics data:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'high' as any,
          }
        );
      }
    },

    // Delete all analytics data
    deleteAllAnalyticsData: async () => {
      try {
        await analytics.deleteAllData();
        await invoke('analytics_delete_all_data');

        // Reset state
        set({
          systemMetrics: null,
          appMetrics: null,
          usageStats: null,
          featureUsage: [],
          privacyConsent: null,
        });
      } catch (error) {
        console.error('Failed to delete analytics data:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'high' as any,
          }
        );
      }
    },

    // Check if feature is enabled
    isFeatureEnabled: (flagName: string) => {
      return featureFlags.isEnabled(flagName);
    },

    // Track feature usage
    trackFeatureUsage: (flagName: string) => {
      featureFlags.trackFeatureUsage(flagName);
    },

    // ==================== ROI Analytics Methods ====================

    // ROI State
    roiReport: null as any | null,
    processMetrics: [] as any[],
    userMetrics: [] as any[],
    toolMetrics: [] as any[],
    trends: {} as Record<string, any[]>,

    isLoadingROI: false,

    // Calculate ROI for date range
    calculateROI: async (startDate: number, endDate: number) => {
      set({ isLoadingROI: true });
      try {
        const roi = await invoke<any>('analytics_calculate_roi', {
          startDate,
          endDate,
        });
        set({ roiReport: roi });
        return roi;
      } catch (error) {
        console.error('Failed to calculate ROI:', error);
        errorTracking.captureError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'analyticsStore',
            severity: 'high' as any,
          }
        );
        throw error;
      } finally {
        set({ isLoadingROI: false });
      }
    },

    // Load process metrics
    loadProcessMetrics: async (startDate: number, endDate: number) => {
      try {
        const metrics = await invoke<any[]>('analytics_get_process_metrics', {
          startDate,
          endDate,
        });
        set({ processMetrics: metrics || [] });
        return metrics || [];
      } catch (error) {
        console.error('Failed to load process metrics:', error);
        throw error;
      }
    },

    // Load user metrics
    loadUserMetrics: async (startDate: number, endDate: number) => {
      try {
        const metrics = await invoke<any[]>('analytics_get_user_metrics', {
          startDate,
          endDate,
        });
        set({ userMetrics: metrics || [] });
        return metrics || [];
      } catch (error) {
        console.error('Failed to load user metrics:', error);
        throw error;
      }
    },

    // Load tool metrics
    loadToolMetrics: async (startDate: number, endDate: number) => {
      try {
        const metrics = await invoke<any[]>('analytics_get_tool_metrics', {
          startDate,
          endDate,
        });
        set({ toolMetrics: metrics || [] });
        return metrics || [];
      } catch (error) {
        console.error('Failed to load tool metrics:', error);
        throw error;
      }
    },

    // Load metric trends
    // Updated Nov 16, 2025: Fixed direct state mutation - use spread operator for immutability
    loadTrends: async (metric: string, days: number) => {
      try {
        const trends = await invoke<any[]>('analytics_get_metric_trends', {
          metric,
          days,
        });
        set((state) => ({
          trends: { ...state.trends, [metric]: trends || [] },
        }));
        return trends || [];
      } catch (error) {
        console.error('Failed to load trends:', error);
        throw error;
      }
    },

    // Export analytics report
    exportReport: async (format: string, startDate: number, endDate: number) => {
      try {
        const report = await invoke<string>('analytics_export_report', {
          format,
          startDate,
          endDate,
        });

        // Download the report
        const blob = new Blob([report as string], {
          type: format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/markdown',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roi-report-${Date.now()}.${format === 'markdown' ? 'md' : format}`;
        a.click();
        URL.revokeObjectURL(url);

        return report;
      } catch (error) {
        console.error('Failed to export report:', error);
        throw error;
      }
    },

    // Load all ROI data
    loadAllROIData: async (startDate: number, endDate: number) => {
      const { calculateROI, loadProcessMetrics, loadUserMetrics, loadToolMetrics } = get();

      set({ isLoadingROI: true });
      try {
        await Promise.all([
          calculateROI(startDate, endDate),
          loadProcessMetrics(startDate, endDate),
          loadUserMetrics(startDate, endDate),
          loadToolMetrics(startDate, endDate),
        ]);
      } finally {
        set({ isLoadingROI: false });
      }
    },
  }))
);

// Updated Nov 16, 2025: Fixed memory leak - store interval ID for cleanup
// Auto-refresh metrics every 30 seconds
let metricsRefreshInterval: number | null = null;

export function startMetricsAutoRefresh() {
  if (metricsRefreshInterval !== null || typeof window === 'undefined') {
    return;
  }

  metricsRefreshInterval = window.setInterval(() => {
    const store = useAnalyticsStore.getState();
    if (store.config.enabled) {
      store.refreshAllMetrics();
    }
  }, 30000);
}

export function stopMetricsAutoRefresh() {
  if (metricsRefreshInterval !== null) {
    window.clearInterval(metricsRefreshInterval);
    metricsRefreshInterval = null;
  }
}
