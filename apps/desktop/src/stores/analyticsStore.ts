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
  }))
);

// Auto-refresh metrics every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    const store = useAnalyticsStore.getState();
    if (store.config.enabled) {
      store.refreshAllMetrics();
    }
  }, 30000);
}
