import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Database, Download, Loader2, X } from 'lucide-react';
import { isTauri, isCloudWeb } from '@/lib/tauri-mock';
import { analyticsDeleteAllData } from '@/api/analytics';
import { chat, cache, settings, onboarding } from '@agiworkforce/api';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { Button } from '../../../ui/Button';
import { Switch } from '../../../ui/Switch';
import { useSettingsStore } from '../../../../stores/settingsStore';
import { errorTracking } from '../../../../services/errorTracking';

const LazyMasterPasswordSettings = lazy(() =>
  import('../../MasterPasswordSettings').then((m) => ({ default: m.MasterPasswordSettings })),
);
const LazyPrivacyDataSection = lazy(() =>
  import('../../Privacy/DataSection').then((m) => ({ default: m.DataSection })),
);
const LazyCacheManagement = lazy(() =>
  import('../../CacheManagement').then((m) => ({ default: m.CacheManagement })),
);
const LazyAllowedDirectoriesSettings = lazy(() =>
  import('../../AllowedDirectoriesSettings').then((m) => ({
    default: m.AllowedDirectoriesSettings,
  })),
);
const LazyAnalyticsSettings = lazy(() =>
  import('../../AnalyticsSettings').then((m) => ({ default: m.AnalyticsSettings })),
);
const LazySafetyPolicies = lazy(() =>
  import('../../../Governance/SafetyPolicies').then((m) => ({ default: m.SafetyPolicies })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function DataPrivacySection() {
  const chatStorageMode = useSettingsStore((state) => state.chatPreferences.chatStorageMode);
  const setChatStorageMode = useSettingsStore((state) => state.setChatStorageMode);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [clearingData, setClearingData] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(() => {
    return errorTracking.getConfig().enabled;
  });
  const [savingCrashReporting, setSavingCrashReporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const result = (await onboarding.getUserPreference('crash_reporting_enabled')) as {
          value: string;
        } | null;
        if (result && mounted) {
          const enabled = result.value === 'true';
          setCrashReportingEnabled(enabled);
          errorTracking.updateConfig({ enabled });
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to load crash reporting preference:', err);
          setCrashReportingEnabled(errorTracking.getConfig().enabled);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClearAllData = async () => {
    const confirmed = confirm(
      'Are you sure you want to clear all local data? This will delete chat history, settings, cached data, and encrypted local credentials, then reload the app.',
    );
    if (!confirmed) return;
    setClearingData(true);
    setClearError(null);
    try {
      const results = await Promise.allSettled([
        chat.clearLocalDatabase(),
        cache.cacheClearAll(),
        settings.settingsV2ClearCache(),
        analyticsDeleteAllData(),
      ]);
      const failures = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => getSimpleErrorMessage(r.reason));
      if (failures.length > 0) throw new Error(failures.join('; '));
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (err) {
      setClearError(getSimpleErrorMessage(err));
    } finally {
      setClearingData(false);
    }
  };

  const handleToggleCrashReporting = useCallback(async (enabled: boolean) => {
    setSavingCrashReporting(true);
    try {
      await onboarding.setUserPreference(
        'crash_reporting_enabled',
        enabled.toString(),
        'privacy',
        'boolean',
        'Enable automatic crash reporting via Sentry',
      );
      errorTracking.updateConfig({ enabled });
      setCrashReportingEnabled(enabled);
    } catch (err) {
      console.error('Failed to save crash reporting preference:', err);
    } finally {
      setSavingCrashReporting(false);
    }
  }, []);

  const exportSuccessTimerRef = useRef<number | null>(null);
  const exportErrorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
      if (exportErrorTimerRef.current) window.clearTimeout(exportErrorTimerRef.current);
    };
  }, []);

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      const exportData = (await onboarding.exportUserData()) as string;
      if (!isTauri) {
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agi-workforce-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setExportSuccess(true);
        if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
        exportSuccessTimerRef.current = window.setTimeout(() => setExportSuccess(false), 5000);
      } else {
        const savePath = await save({
          defaultPath: `agi-workforce-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (savePath) {
          await writeTextFile(savePath, exportData);
          setExportSuccess(true);
          if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
          exportSuccessTimerRef.current = window.setTimeout(() => setExportSuccess(false), 5000);
        }
      }
    } catch (err) {
      console.error('Failed to export data:', err);
      setExportError(getSimpleErrorMessage(err));
      if (exportErrorTimerRef.current) window.clearTimeout(exportErrorTimerRef.current);
      exportErrorTimerRef.current = window.setTimeout(() => setExportError(null), 5000);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Data &amp; Privacy</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your data, privacy settings, and GDPR compliance
      </p>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-muted p-3">
              <Download className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Export Your Data</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Download all your conversations, messages, and settings in JSON format. This
                includes all data stored locally on your device.
              </p>
              <Button onClick={handleExportData} disabled={exporting} size="sm">
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export Data
                  </>
                )}
              </Button>
              {exportSuccess && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>Data exported successfully!</span>
                </div>
              )}
              {exportError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                  <X className="h-4 w-4" />
                  <span>{exportError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Data Storage</h4>
          {isTauri ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                All your data is stored locally on your device at:
              </p>
              <code className="block rounded bg-secondary px-3 py-2 text-xs font-mono">
                {typeof window !== 'undefined' && navigator.platform.startsWith('Win')
                  ? '%APPDATA%\\AGI Workforce\\'
                  : '~/.local/share/agi-workforce/'}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Integration credentials (GitHub tokens, MCP server keys, etc.) are stored securely
                in an encrypted local database.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Stored securely in the cloud. Data is encrypted at rest and in transit.
            </p>
          )}
        </div>

        {!isCloudWeb && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div>
              <h4 className="font-semibold mb-1">Chat History Storage</h4>
              <p className="text-sm text-muted-foreground">
                Choose where your chat history is kept. Local storage never leaves your device.
                Cloud sync backs up your conversations to your account.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="chatStorageMode" className="text-sm font-medium">
                  Sync chat history to cloud
                </label>
                <p className="text-xs text-muted-foreground">
                  {chatStorageMode === 'cloud'
                    ? 'Conversations are synced to your account after each message.'
                    : 'Conversations stay on this device only (default).'}
                </p>
              </div>
              <Switch
                id="chatStorageMode"
                checked={chatStorageMode === 'cloud'}
                onCheckedChange={(checked) => setChatStorageMode(checked ? 'cloud' : 'local')}
              />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-red-500/10 p-3">
              <Database className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2 text-red-600 dark:text-red-400">
                Clear Local Storage
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Reset the application to its initial state. This will clear all chat history,
                settings, cached data, and encrypted local credentials. This action cannot be
                undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleClearAllData()}
                disabled={clearingData}
              >
                {clearingData ? 'Clearing...' : 'Clear All Data'}
              </Button>
              {clearError && <p className="mt-3 text-sm text-red-600">{clearError}</p>}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Privacy &amp; Security</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>Chat history and settings are stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>Integration credentials are encrypted and stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>You can export your data at any time in standard JSON format</span>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
            GDPR Compliance
          </h4>
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            AGI Workforce respects your right to data portability and privacy. Use the export
            feature above to exercise your GDPR rights. To delete all your data, simply uninstall
            the application and remove the data directory.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Crash Reporting</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Help us improve AGI Workforce by automatically sending crash reports and error
                diagnostics. Reports include stack traces and system information but never include
                your conversations, API keys, or personal data.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground mb-3">
                <li>Error messages and stack traces</li>
                <li>Operating system and app version</li>
                <li>Memory and performance metrics</li>
                <li>NO personal data, API keys, or conversation content</li>
              </ul>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={crashReportingEnabled}
                  disabled={savingCrashReporting}
                  onChange={(e) => void handleToggleCrashReporting(e.target.checked)}
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"></div>
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {crashReportingEnabled
              ? 'Crash reporting is enabled. Thank you for helping us improve!'
              : 'Crash reporting is disabled. You can enable it anytime.'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This preference applies immediately and is not controlled by Save/Cancel.
          </p>
        </div>
      </div>
    </div>
  );
}

interface PrivacyTabProps {
  onOpenGovernanceWorkspace: () => void;
}

export function PrivacyTab({ onOpenGovernanceWorkspace }: PrivacyTabProps) {
  return (
    <>
      <div>
        <h3 className="text-lg font-semibold mb-1">Master Password</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Encrypt stored API keys and secrets with an Argon2id-derived master password.
        </p>
        <Suspense fallback={<Fallback label="Loading security settings..." />}>
          <LazyMasterPasswordSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading data controls..." />}>
          <LazyPrivacyDataSection />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <DataPrivacySection />
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading cache settings..." />}>
          <LazyCacheManagement />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <Suspense fallback={<Fallback label="Loading filesystem permissions..." />}>
          <LazyAllowedDirectoriesSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Analytics</h3>
        <Suspense fallback={<Fallback label="Loading analytics settings..." />}>
          <LazyAnalyticsSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-1">Governance &amp; Compliance</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Governance now lives in a dedicated workspace. Keep policy controls here and open the
          right panel for approvals, audit events, and execution history.
        </p>
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="text-sm font-medium">Open governance workspace</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Review pending approvals, audit integrity, and tool history without duplicating
                those views inside Settings.
              </p>
            </div>
            <Button variant="outline" onClick={onOpenGovernanceWorkspace}>
              Open Workspace
            </Button>
          </div>
        </div>
        <div className="pt-6">
          <Suspense fallback={<Fallback label="Loading governance policies..." />}>
            <LazySafetyPolicies />
          </Suspense>
        </div>
      </div>
    </>
  );
}
