/**
 * Analytics Settings Component
 *
 * Privacy-first controls for analytics, error reporting, and performance monitoring
 * GDPR/CCPA compliant
 */

import React, { useState } from 'react';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import { PrivacyConsent } from '../../types/analytics';
import { analytics } from '../../services/analytics';

export const AnalyticsSettings: React.FC = () => {
  const {
    config,
    privacyConsent,
    updatePrivacyConsent,
    exportAnalyticsData,
    deleteAllAnalyticsData,
  } = useAnalyticsStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentConsent: PrivacyConsent = privacyConsent || {
    analytics_enabled: false,
    error_reporting_enabled: false,
    performance_monitoring_enabled: false,
    consent_date: new Date().toISOString(),
    consent_version: '1.0',
  };

  const handleToggle = (key: keyof Omit<PrivacyConsent, 'consent_date' | 'consent_version'>) => {
    const newConsent: PrivacyConsent = {
      ...currentConsent,
      [key]: !currentConsent[key],
      consent_date: new Date().toISOString(),
    };
    updatePrivacyConsent(newConsent);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await exportAnalyticsData();
      alert('Analytics data exported successfully!');
    } catch (error) {
      console.error('Failed to export data:', error);
      alert('Failed to export analytics data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    try {
      await deleteAllAnalyticsData();
      alert('All analytics data deleted successfully!');
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete data:', error);
      alert('Failed to delete analytics data. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Analytics & Privacy Settings
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Control how we collect and use your data. We're committed to protecting your
          privacy.
        </p>
      </div>

      {/* Privacy Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Privacy First
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          We never collect personally identifiable information (PII). All analytics are
          anonymous and used solely to improve the product. You have full control over what
          data is collected.
        </p>
      </div>

      {/* Analytics Toggles */}
      <div className="space-y-4">
        <SettingToggle
          title="Enable Analytics"
          description="Allow us to collect anonymous usage data to improve the product. No personal information is collected."
          enabled={currentConsent.analytics_enabled}
          onToggle={() => handleToggle('analytics_enabled')}
        />

        <SettingToggle
          title="Error Reporting"
          description="Automatically report errors and crashes to help us fix bugs faster. Error reports may include stack traces but no personal data."
          enabled={currentConsent.error_reporting_enabled}
          onToggle={() => handleToggle('error_reporting_enabled')}
        />

        <SettingToggle
          title="Performance Monitoring"
          description="Track app performance metrics like startup time and memory usage to help us optimize the experience."
          enabled={currentConsent.performance_monitoring_enabled}
          onToggle={() => handleToggle('performance_monitoring_enabled')}
        />
      </div>

      {/* Data Details */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          What Data Do We Collect?
        </h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <DataCollectionItem
            label="Usage Events"
            description="Actions like creating automations, running goals, and feature usage"
            collected={currentConsent.analytics_enabled}
          />
          <DataCollectionItem
            label="Performance Metrics"
            description="App startup time, page load times, API response times, memory usage"
            collected={currentConsent.performance_monitoring_enabled}
          />
          <DataCollectionItem
            label="Error Logs"
            description="Error types, stack traces, and component names (no user data)"
            collected={currentConsent.error_reporting_enabled}
          />
          <DataCollectionItem
            label="Device Info"
            description="OS version, app version, and basic system specs"
            collected={currentConsent.analytics_enabled}
          />
        </div>
      </div>

      {/* What We Never Collect */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          What We Never Collect
        </h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-red-600">✗</span>
            <span>Personal information (names, emails, phone numbers)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600">✗</span>
            <span>IP addresses or precise location data</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600">✗</span>
            <span>File contents or automation logic</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600">✗</span>
            <span>API keys, passwords, or credentials</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600">✗</span>
            <span>Chat messages or conversation history</span>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Your Data Rights
        </h3>
        <div className="space-y-4">
          {/* Export Data */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Export Your Data
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Download all analytics data we've collected about you
              </p>
            </div>
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export Data'}
            </button>
          </div>

          {/* Delete Data */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Delete All Data
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Permanently delete all analytics data associated with this device
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete Data
            </button>
          </div>
        </div>
      </div>

      {/* Consent Info */}
      {privacyConsent && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Last updated: {new Date(privacyConsent.consent_date).toLocaleDateString()} •
            Consent version: {privacyConsent.consent_version}
          </p>
        </div>
      )}

      {/* Privacy Policy Link */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <a
          href="https://agiworkforce.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Read our full Privacy Policy →
        </a>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Delete All Analytics Data?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This will permanently delete all analytics data we've collected. This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAllData}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete All Data'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Setting Toggle Component
interface SettingToggleProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({
  title,
  description,
  enabled,
  onToggle,
}) => {
  return (
    <div className="flex items-start justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex-1 pr-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-1">{title}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

// Data Collection Item
interface DataCollectionItemProps {
  label: string;
  description: string;
  collected: boolean;
}

const DataCollectionItem: React.FC<DataCollectionItemProps> = ({
  label,
  description,
  collected,
}) => {
  return (
    <div className="flex items-start gap-3">
      <span className={collected ? 'text-green-600' : 'text-gray-400'}>
        {collected ? '✓' : '○'}
      </span>
      <div className="flex-1">
        <span className="font-medium text-gray-900 dark:text-white">{label}:</span>{' '}
        <span>{description}</span>
      </div>
    </div>
  );
};

export default AnalyticsSettings;
