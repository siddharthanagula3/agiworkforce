import { analytics } from '../../services/analytics';
import { ErrorSeverity, errorTracking } from '../../services/errorTracking';
import { featureFlags } from '../../services/featureFlags';
import { performanceMonitor } from '../../services/performance';
import {
  analyticsDeleteAllData,
  analyticsGetUsageStats,
  analyticsGetFeatureUsage,
  analyticsCalculateRoi,
  analyticsGetProcessMetrics,
  analyticsGetUserMetrics,
  analyticsGetToolMetrics,
  analyticsGetMetricTrends,
  analyticsExportReport,
  metricsIncrementAutomations,
  metricsIncrementGoals,
  metricsSetMcpServers,
  metricsSetCacheHitRate,
  trackWorkflowView as apiTrackWorkflowView,
} from '../../api/analytics';
import type {
  SystemMetrics as ApiSystemMetrics,
  AppMetrics as ApiAppMetrics,
} from '../../api/analytics';
import type { AnalyticsConfig, PrivacyConsent } from '../../types/analytics';
import type {
  ROIReport,
  ProcessMetrics,
  UserMetrics as ApiUserMetrics,
  ToolMetrics,
  TrendPoint,
  UsageStats as AnalyticsUsageStats,
  FeatureUsageEntry,
} from '../../api/analytics';

export interface AnalyticsSliceState {
  systemMetrics: ApiSystemMetrics | null;
  appMetrics: ApiAppMetrics | null;
  analyticsUsageStats: AnalyticsUsageStats | null;
  featureUsage: FeatureUsageEntry[];
  analyticsConfig: AnalyticsConfig;
  privacyConsent: PrivacyConsent | null;
  isLoadingMetrics: boolean;
  isLoadingStats: boolean;
  roiReport: ROIReport | null;
  processMetrics: ProcessMetrics[];
  userMetrics: ApiUserMetrics[];
  toolMetrics: ToolMetrics[];
  trends: Record<string, TrendPoint[]>;
  isLoadingROI: boolean;
}

export interface AnalyticsSliceActions {
  loadSystemMetrics: () => Promise<void>;
  loadAppMetrics: () => Promise<void>;
  loadAnalyticsUsageStats: () => Promise<void>;
  loadFeatureUsage: () => Promise<void>;
  refreshAllMetrics: () => Promise<void>;
  updateAnalyticsConfig: (config: Partial<AnalyticsConfig>) => void;
  updatePrivacyConsent: (consent: PrivacyConsent) => void;
  exportAnalyticsData: () => Promise<void>;
  deleteAllAnalyticsData: () => Promise<void>;
  isFeatureEnabled: (flagName: string) => boolean;
  trackFeatureUsage: (flagName: string) => void;
  incrementAutomationsMetric: () => Promise<void>;
  incrementGoalsMetric: () => Promise<void>;
  setMcpServersMetric: (count: number) => Promise<void>;
  setCacheHitRateMetric: (rate: number) => Promise<void>;
  trackWorkflowView: (workflowId: string) => Promise<void>;
  calculateROI: (startDate: number, endDate: number) => Promise<ROIReport>;
  loadProcessMetrics: (startDate: number, endDate: number) => Promise<ProcessMetrics[]>;
  loadUserMetrics: (startDate: number, endDate: number) => Promise<ApiUserMetrics[]>;
  loadToolMetrics: (startDate: number, endDate: number) => Promise<ToolMetrics[]>;
  loadTrends: (metric: string, days: number) => Promise<TrendPoint[]>;
  exportReport: (format: string, startDate: number, endDate: number) => Promise<string>;
  loadAllROIData: (startDate: number, endDate: number) => Promise<void>;
}

export type AnalyticsSlice = AnalyticsSliceState & AnalyticsSliceActions;

const MAX_TREND_METRICS = 20;

export const createAnalyticsSlice = (
  set: (
    partial: Partial<AnalyticsSlice> | ((s: AnalyticsSlice) => Partial<AnalyticsSlice>),
  ) => void,
  get: () => AnalyticsSlice,
): AnalyticsSlice => ({
  systemMetrics: null,
  appMetrics: null,
  analyticsUsageStats: null,
  featureUsage: [],
  analyticsConfig: analytics.getConfig(),
  privacyConsent: analytics.getPrivacyConsent() || null,
  isLoadingMetrics: false,
  isLoadingStats: false,
  roiReport: null,
  processMetrics: [],
  userMetrics: [],
  toolMetrics: [],
  trends: {},
  isLoadingROI: false,

  loadSystemMetrics: async () => {
    set({ isLoadingMetrics: true });
    try {
      const metrics = await performanceMonitor.getSystemMetrics();
      set({ systemMetrics: metrics });
    } catch (error) {
      console.error('Failed to load system metrics:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
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
        component: 'billingUsageStore',
        severity: ErrorSeverity.MEDIUM,
      });
    } finally {
      set({ isLoadingMetrics: false });
    }
  },

  loadAnalyticsUsageStats: async () => {
    set({ isLoadingStats: true });
    try {
      const stats = await analyticsGetUsageStats();
      set({ analyticsUsageStats: stats });
    } catch (error) {
      console.error('Failed to load usage stats:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.MEDIUM,
      });
    } finally {
      set({ isLoadingStats: false });
    }
  },

  loadFeatureUsage: async () => {
    try {
      const usage = await analyticsGetFeatureUsage();
      const cappedUsage = Array.isArray(usage) ? usage.slice(0, 500) : [];
      set({ featureUsage: cappedUsage });
    } catch (error) {
      console.error('Failed to load feature usage:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.MEDIUM,
      });
    }
  },

  refreshAllMetrics: async () => {
    const { loadSystemMetrics, loadAppMetrics, loadAnalyticsUsageStats, loadFeatureUsage } = get();
    await Promise.all([
      loadSystemMetrics(),
      loadAppMetrics(),
      loadAnalyticsUsageStats(),
      loadFeatureUsage(),
    ]);
  },

  updateAnalyticsConfig: (newConfig) => {
    set((state) => ({ analyticsConfig: { ...state.analyticsConfig, ...newConfig } }));
    analytics.updateConfig(newConfig);
  },

  updatePrivacyConsent: (consent) => {
    set({ privacyConsent: consent });
    analytics.updatePrivacyConsent(consent);
    if (consent.error_reporting_enabled) errorTracking.initialize();
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
      analytics.track('data_exported', { export_type: 'analytics' });
    } catch (error) {
      console.error('Failed to export analytics data:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.HIGH,
      });
    }
  },

  deleteAllAnalyticsData: async () => {
    try {
      await analytics.deleteAllData();
      await analyticsDeleteAllData();
      set({
        systemMetrics: null,
        appMetrics: null,
        analyticsUsageStats: null,
        featureUsage: [],
        privacyConsent: null,
      });
    } catch (error) {
      console.error('Failed to delete analytics data:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.HIGH,
      });
    }
  },

  isFeatureEnabled: (flagName) => featureFlags.isEnabled(flagName),
  trackFeatureUsage: (flagName) => featureFlags.trackFeatureUsage(flagName),

  incrementAutomationsMetric: async () => {
    try {
      await metricsIncrementAutomations();
    } catch (error) {
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        tags: { action: 'incrementAutomationsMetric' },
      });
    }
  },

  incrementGoalsMetric: async () => {
    try {
      await metricsIncrementGoals();
    } catch (error) {
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        tags: { action: 'incrementGoalsMetric' },
      });
    }
  },

  setMcpServersMetric: async (count) => {
    try {
      await metricsSetMcpServers(count);
    } catch (error) {
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        tags: { action: 'setMcpServersMetric' },
      });
    }
  },

  setCacheHitRateMetric: async (rate) => {
    try {
      await metricsSetCacheHitRate(rate);
    } catch (error) {
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        tags: { action: 'setCacheHitRateMetric' },
      });
    }
  },

  trackWorkflowView: async (workflowId) => {
    try {
      await apiTrackWorkflowView(workflowId);
    } catch (error) {
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        tags: { action: 'trackWorkflowView' },
      });
    }
  },

  calculateROI: async (startDate, endDate) => {
    set({ isLoadingROI: true });
    try {
      const roi = await analyticsCalculateRoi(startDate, endDate);
      set({ roiReport: roi });
      return roi;
    } catch (error) {
      console.error('Failed to calculate ROI:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.HIGH,
      });
      throw error;
    } finally {
      set({ isLoadingROI: false });
    }
  },

  loadProcessMetrics: async (startDate, endDate) => {
    try {
      const metrics = await analyticsGetProcessMetrics(startDate, endDate);
      set({ processMetrics: metrics || [] });
      return metrics || [];
    } catch (error) {
      console.error('Failed to load process metrics:', error);
      throw error;
    }
  },

  loadUserMetrics: async (startDate, endDate) => {
    try {
      const metrics = await analyticsGetUserMetrics(startDate, endDate);
      set({ userMetrics: metrics || [] });
      return metrics || [];
    } catch (error) {
      console.error('Failed to load user metrics:', error);
      throw error;
    }
  },

  loadToolMetrics: async (startDate, endDate) => {
    try {
      const metrics = await analyticsGetToolMetrics(startDate, endDate);
      set({ toolMetrics: metrics || [] });
      return metrics || [];
    } catch (error) {
      console.error('Failed to load tool metrics:', error);
      throw error;
    }
  },

  loadTrends: async (metric, days) => {
    try {
      const trendsData = await analyticsGetMetricTrends(metric, days);
      set((state) => {
        const currentKeys = Object.keys(state.trends);
        const newTrends = { ...state.trends };
        if (currentKeys.length >= MAX_TREND_METRICS && !newTrends[metric]) {
          const keyToRemove = currentKeys[0];
          if (keyToRemove) delete newTrends[keyToRemove];
        }
        newTrends[metric] = trendsData || [];
        return { trends: newTrends };
      });
      return trendsData || [];
    } catch (error) {
      console.error('Failed to load trends:', error);
      throw error;
    }
  },

  exportReport: async (format, startDate, endDate) => {
    try {
      const report = await analyticsExportReport(format, startDate, endDate);
      const blob = new Blob([report as string], {
        type:
          format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/markdown',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roi-report-${Date.now()}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return report;
    } catch (error) {
      console.error('Failed to export report:', error);
      throw error;
    }
  },

  loadAllROIData: async (startDate, endDate) => {
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
});
