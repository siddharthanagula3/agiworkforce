/**
 * Analytics Metrics Store
 *
 * Manages system/app metrics, feature usage, analytics config, and privacy consent.
 * Split from billingUsage.ts for better separation of concerns.
 *
 * Middleware: devtools(subscribeWithSelector(...))
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { analytics } from '../services/analytics';
import { ErrorSeverity, errorTracking } from '../services/errorTracking';
import { featureFlags } from '../services/featureFlags';
import { performanceMonitor } from '../services/performance';
import type {
  AnalyticsConfig,
  AppMetrics,
  FeatureUsageStats,
  PrivacyConsent,
  SystemMetrics,
  UsageStats as AnalyticsUsageStats,
} from '../types/analytics';

// ============================================================================
// Types
// ============================================================================

interface AnalyticsMetricsState {
  systemMetrics: SystemMetrics | null;
  appMetrics: AppMetrics | null;
  analyticsUsageStats: AnalyticsUsageStats | null;
  featureUsage: FeatureUsageStats[];
  analyticsConfig: AnalyticsConfig;
  privacyConsent: PrivacyConsent | null;
  isLoadingMetrics: boolean;
  isLoadingStats: boolean;
}

interface AnalyticsMetricsActions {
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
}

export type AnalyticsMetricsStore = AnalyticsMetricsState & AnalyticsMetricsActions;

// ============================================================================
// Store
// ============================================================================

export const useAnalyticsMetricsStore = create<AnalyticsMetricsStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // State
      systemMetrics: null,
      appMetrics: null,
      analyticsUsageStats: null,
      featureUsage: [],
      analyticsConfig: analytics.getConfig(),
      privacyConsent: analytics.getPrivacyConsent() || null,
      isLoadingMetrics: false,
      isLoadingStats: false,

      // Actions
      loadSystemMetrics: async () => {
        set({ isLoadingMetrics: true });
        try {
          const metrics = await performanceMonitor.getSystemMetrics();
          set({ systemMetrics: metrics });
        } catch (error) {
          console.error('Failed to load system metrics:', error);
          errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
            component: 'analyticsMetricsStore',
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
            component: 'analyticsMetricsStore',
            severity: ErrorSeverity.MEDIUM,
          });
        } finally {
          set({ isLoadingMetrics: false });
        }
      },

      loadAnalyticsUsageStats: async () => {
        set({ isLoadingStats: true });
        try {
          const stats = await invoke<AnalyticsUsageStats>('analytics_get_usage_stats');
          set({ analyticsUsageStats: stats });
        } catch (error) {
          console.error('Failed to load usage stats:', error);
          errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
            component: 'analyticsMetricsStore',
            severity: ErrorSeverity.MEDIUM,
          });
        } finally {
          set({ isLoadingStats: false });
        }
      },

      loadFeatureUsage: async () => {
        try {
          const usage = await invoke<FeatureUsageStats[]>('analytics_get_feature_usage');
          // STR-006 fix: Cap featureUsage at 500 entries to prevent unbounded growth
          const cappedUsage = Array.isArray(usage) ? usage.slice(0, 500) : [];
          set({ featureUsage: cappedUsage });
        } catch (error) {
          console.error('Failed to load feature usage:', error);
          errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
            component: 'analyticsMetricsStore',
            severity: ErrorSeverity.MEDIUM,
          });
        }
      },

      refreshAllMetrics: async () => {
        const { loadSystemMetrics, loadAppMetrics, loadAnalyticsUsageStats, loadFeatureUsage } =
          get();
        await Promise.all([
          loadSystemMetrics(),
          loadAppMetrics(),
          loadAnalyticsUsageStats(),
          loadFeatureUsage(),
        ]);
      },

      updateAnalyticsConfig: (newConfig: Partial<AnalyticsConfig>) => {
        set((state) => ({
          analyticsConfig: { ...state.analyticsConfig, ...newConfig },
        }));
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
          analytics.track('data_exported', { export_type: 'analytics' });
        } catch (error) {
          console.error('Failed to export analytics data:', error);
          errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
            component: 'analyticsMetricsStore',
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
            analyticsUsageStats: null,
            featureUsage: [],
            privacyConsent: null,
          });
        } catch (error) {
          console.error('Failed to delete analytics data:', error);
          errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
            component: 'analyticsMetricsStore',
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
    })),
    { name: 'AnalyticsMetricsStore', enabled: import.meta.env.DEV },
  ),
);
