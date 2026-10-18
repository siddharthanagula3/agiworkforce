import { analytics } from '../../services/analytics';
import { ErrorSeverity, errorTracking } from '../../services/errorTracking';
import { analyticsDeleteAllData } from '../../api/analytics';
import type { PrivacyConsent } from '../../types/analytics';

export interface AnalyticsSliceState {
  privacyConsent: PrivacyConsent | null;
}

export interface AnalyticsSliceActions {
  updatePrivacyConsent: (consent: PrivacyConsent) => void;
  exportAnalyticsData: () => Promise<void>;
  deleteAllAnalyticsData: () => Promise<void>;
}

export type AnalyticsSlice = AnalyticsSliceState & AnalyticsSliceActions;

export const createAnalyticsSlice = (
  set: (
    partial: Partial<AnalyticsSlice> | ((s: AnalyticsSlice) => Partial<AnalyticsSlice>),
  ) => void,
): AnalyticsSlice => ({
  privacyConsent: analytics.getPrivacyConsent() || null,

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
      throw error;
    }
  },

  deleteAllAnalyticsData: async () => {
    try {
      await analytics.deleteAllData();
      await analyticsDeleteAllData();
      set({ privacyConsent: null });
    } catch (error) {
      console.error('Failed to delete analytics data:', error);
      errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
        component: 'billingUsageStore',
        severity: ErrorSeverity.HIGH,
      });
      throw error;
    }
  },
});
