import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import { analytics } from '../services/analytics';
import { ErrorSeverity, errorTracking } from '../services/errorTracking';
import { featureFlags } from '../services/featureFlags';
import { performanceMonitor } from '../services/performance';
import {
  AnalyticsConfig,
  AppMetrics,
  FeatureUsageStats,
  PrivacyConsent,
  SystemMetrics,
  UsageStats,
} from '../types/analytics';
import type { AllTimeStats, ChartDataPoint, TopEmployee } from '../types/roi';

interface AnalyticsState {
  systemMetrics: SystemMetrics | null;
  appMetrics: AppMetrics | null;
  usageStats: UsageStats | null;
  featureUsage: FeatureUsageStats[];

  config: AnalyticsConfig;
  privacyConsent: PrivacyConsent | null;

  isLoadingMetrics: boolean;
  isLoadingStats: boolean;

  roiReport: AllTimeStats | null;
  processMetrics: ChartDataPoint[];
  userMetrics: TopEmployee[];
  toolMetrics: ChartDataPoint[];
  trends: Record<string, ChartDataPoint[]>;
  isLoadingROI: boolean;

  loadSystemMetrics: () => Promise<void>;
  loadAppMetrics: () => Promise<void>;
  loadUsageStats: () => Promise<void>;
  loadFeatureUsage: () => Promise<void>;
  refreshAllMetrics: () => Promise<void>;

  updateConfig: (config: Partial<AnalyticsConfig>) => void;
  updatePrivacyConsent: (consent: PrivacyConsent) => void;

  exportAnalyticsData: () => Promise<void>;
  deleteAllAnalyticsData: () => Promise<void>;

  isFeatureEnabled: (flagName: string) => boolean;
  trackFeatureUsage: (flagName: string) => void;

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
    systemMetrics: null,
    appMetrics: null,
    usageStats: null,
    featureUsage: [],
    config: analytics.getConfig(),
    privacyConsent: analytics.getPrivacyConsent() || null,
    isLoadingMetrics: false,
    isLoadingStats: false,

    loadSystemMetrics: async () => {
      set({ isLoadingMetrics: true });
      try {
        const metrics = await performanceMonitor.getSystemMetrics();
        set({ systemMetrics: metrics });
      } catch (error) {
        console.error('Failed to load system metrics:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.MEDIUM,
        });
      } finally {
        set({ isLoadingMetrics: false });
      }
    },

    loadAppMetrics: async () => {
      set({ isLoadingMetrics: true });
      try {
        const metrics = await performanceMonitor.getAppMetrics();
        set({ appMetrics: metrics });
      } catch (error) {
        console.error('Failed to load app metrics:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.MEDIUM,
        });
      } finally {
        set({ isLoadingMetrics: false });
      }
    },

    loadUsageStats: async () => {
      set({ isLoadingStats: true });
      try {
        const stats = await invoke<UsageStats>('analytics_get_usage_stats');
        set({ usageStats: stats });
      } catch (error) {
        console.error('Failed to load usage stats:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.MEDIUM,
        });
      } finally {
        set({ isLoadingStats: false });
      }
    },

    loadFeatureUsage: async () => {
      try {
        const usage = await invoke<FeatureUsageStats[]>('analytics_get_feature_usage');
        set({ featureUsage: usage });
      } catch (error) {
        console.error('Failed to load feature usage:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.MEDIUM,
        });
      }
    },

    refreshAllMetrics: async () => {
      const { loadSystemMetrics, loadAppMetrics, loadUsageStats, loadFeatureUsage } = get();
      await Promise.all([
        loadSystemMetrics(),
        loadAppMetrics(),
        loadUsageStats(),
        loadFeatureUsage(),
      ]);
    },

    updateConfig: (newConfig: Partial<AnalyticsConfig>) => {
      set((state) => {
        state.config = { ...state.config, ...newConfig };
      });
      analytics.updateConfig(newConfig);
    },

    updatePrivacyConsent: (consent: PrivacyConsent) => {
      set({ privacyConsent: consent });
      analytics.updatePrivacyConsent(consent);

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

    exportAnalyticsData: async () => {
      try {
        await analytics.exportData();
        analytics.track('data_exported', {
          export_type: 'analytics',
        });
      } catch (error) {
        console.error('Failed to export analytics data:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.HIGH,
        });
      }
    },

    deleteAllAnalyticsData: async () => {
      try {
        await analytics.deleteAllData();
        await invoke('analytics_delete_all_data');

        set({
          systemMetrics: null,
          appMetrics: null,
          usageStats: null,
          featureUsage: [],
          privacyConsent: null,
        });
      } catch (error) {
        console.error('Failed to delete analytics data:', error);
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.HIGH,
        });
      }
    },

    isFeatureEnabled: (flagName: string) => {
      return featureFlags.isEnabled(flagName);
    },

    trackFeatureUsage: (flagName: string) => {
      featureFlags.trackFeatureUsage(flagName);
    },

    roiReport: null as AllTimeStats | null,
    processMetrics: [] as ChartDataPoint[],
    userMetrics: [] as TopEmployee[],
    toolMetrics: [] as ChartDataPoint[],
    trends: {} as Record<string, ChartDataPoint[]>,

    isLoadingROI: false,

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
        errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
          component: 'analyticsStore',
          severity: ErrorSeverity.HIGH,
        });
        throw error;
      } finally {
        set({ isLoadingROI: false });
      }
    },

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

    exportReport: async (format: string, startDate: number, endDate: number) => {
      try {
        const report = await invoke<string>('analytics_export_report', {
          format,
          startDate,
          endDate,
        });

        const blob = new Blob([report as string], {
          type:
            format === 'json'
              ? 'application/json'
              : format === 'csv'
                ? 'text/csv'
                : 'text/markdown',
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
  })),
);

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
