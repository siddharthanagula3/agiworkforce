import { invoke } from '@/lib/tauri-mock';
import React, { useState } from 'react';

interface PrivacyPreferences {
  telemetryEnabled: boolean;
  crashReportingEnabled: boolean;
  aiModelSharingEnabled: boolean;
  analyticsEnabled: boolean;
  usageDataCollection: boolean;
}

export const PrivacySettings: React.FC = () => {
  const [preferences, setPreferences] = useState<PrivacyPreferences>({
    telemetryEnabled: false,
    crashReportingEnabled: true,
    aiModelSharingEnabled: false,
    analyticsEnabled: false,
    usageDataCollection: false,
  });

  const [loading, setLoading] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleToggle = (key: keyof PrivacyPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await invoke('settings_update_privacy', { preferences });
      // Show success notification
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      // Show error notification
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    setLoading(true);
    try {
      const data = await invoke<string>('privacy_export_data');
      // Create download link
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agiworkforce-data-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setShowExportDialog(false);
    } catch (error) {
      console.error('Failed to export data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      await invoke('privacy_delete_account');
      // Logout and redirect to welcome screen
      window.location.href = '/welcome';
    } catch (error) {
      console.error('Failed to delete account:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="privacy-settings">
      <div className="settings-header">
        <h2>Privacy & Security</h2>
        <p className="text-muted">
          Control your data and privacy preferences
        </p>
      </div>

      <div className="settings-section">
        <h3>Data Collection</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="telemetry">Telemetry</label>
            <p className="setting-description">
              Help improve AGI Workforce by sending anonymous usage data and
              performance metrics
            </p>
          </div>
          <div className="setting-control">
            <input
              type="checkbox"
              id="telemetry"
              checked={preferences.telemetryEnabled}
              onChange={() => handleToggle('telemetryEnabled')}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="crash-reporting">Crash Reporting</label>
            <p className="setting-description">
              Automatically send crash reports to help us fix bugs and improve
              stability
            </p>
          </div>
          <div className="setting-control">
            <input
              type="checkbox"
              id="crash-reporting"
              checked={preferences.crashReportingEnabled}
              onChange={() => handleToggle('crashReportingEnabled')}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="ai-model-sharing">AI Model Improvement</label>
            <p className="setting-description">
              Share your interactions with AI models to help improve their
              accuracy (data is anonymized)
            </p>
          </div>
          <div className="setting-control">
            <input
              type="checkbox"
              id="ai-model-sharing"
              checked={preferences.aiModelSharingEnabled}
              onChange={() => handleToggle('aiModelSharingEnabled')}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="analytics">Analytics</label>
            <p className="setting-description">
              Allow analytics tracking to help us understand how you use the app
            </p>
          </div>
          <div className="setting-control">
            <input
              type="checkbox"
              id="analytics"
              checked={preferences.analyticsEnabled}
              onChange={() => handleToggle('analyticsEnabled')}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="usage-data">Usage Data Collection</label>
            <p className="setting-description">
              Collect detailed usage patterns to provide personalized
              recommendations
            </p>
          </div>
          <div className="setting-control">
            <input
              type="checkbox"
              id="usage-data"
              checked={preferences.usageDataCollection}
              onChange={() => handleToggle('usageDataCollection')}
            />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Your Data</h3>

        <div className="setting-item">
          <div className="setting-info">
            <label>Export Your Data</label>
            <p className="setting-description">
              Download a copy of all your data in JSON format (GDPR compliant)
            </p>
          </div>
          <div className="setting-control">
            <button
              className="btn btn-secondary"
              onClick={() => setShowExportDialog(true)}
            >
              Export Data
            </button>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Delete Account</label>
            <p className="setting-description">
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
          </div>
          <div className="setting-control">
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Legal</h3>

        <div className="setting-item">
          <div className="setting-info">
            <a
              href="https://agiworkforce.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <a
              href="https://agiworkforce.com/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <a
              href="https://agiworkforce.com/security"
              target="_blank"
              rel="noopener noreferrer"
            >
              Security Practices
            </a>
          </div>
        </div>
      </div>

      <div className="settings-footer">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Export Data Dialog */}
      {showExportDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Export Your Data</h3>
            <p>
              Your data will be exported as a JSON file containing all your
              conversations, settings, and automation history.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowExportDialog(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExportData}
                disabled={loading}
              >
                {loading ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Dialog */}
      {showDeleteDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Account</h3>
            <div className="warning">
              <p>
                <strong>Warning:</strong> This action is permanent and cannot
                be undone.
              </p>
              <p>All of the following will be deleted:</p>
              <ul>
                <li>Your account and profile</li>
                <li>All conversations and chat history</li>
                <li>All automation workflows</li>
                <li>All settings and preferences</li>
                <li>All API keys and integrations</li>
              </ul>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteDialog(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacySettings;
