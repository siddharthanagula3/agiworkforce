import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Check, Database, Download, Loader2 } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { isTauri, relaunchApp } from '@/lib/tauri-mock';
import { analyticsDeleteAllData } from '@/api/analytics';
import { deleteLocalData, exportLocalData } from '@/api/privacy';
import { settings, onboarding } from '@agiworkforce/desktop-command-client';
import { appDataDir } from '@tauri-apps/api/path';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';
import { errorTracking } from '../../../../services/errorTracking';
import { MASTER_PASSWORD_SCOPE } from '../../masterPasswordScope';
import { selectHasCloudAccountSession, useAuthStore } from '../../../../stores/auth';

const LazyMasterPasswordSettings = lazy(() =>
  import('../../MasterPasswordSettings').then((m) => ({ default: m.MasterPasswordSettings })),
);
const LazyCloudDataSection = lazy(() =>
  import('../../Privacy/CloudDataSection').then((m) => ({ default: m.CloudDataSection })),
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
const LazyGovernanceDashboard = lazy(() =>
  import('@/features/governance/GovernanceDashboard').then((m) => ({
    default: m.GovernanceDashboard,
  })),
);
const LazySafetyPolicies = lazy(() =>
  import('@/features/governance/SafetyPolicies').then((m) => ({ default: m.SafetyPolicies })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function hostMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function DataPrivacySection() {
  const [exporting, setExporting] = useState(false);
  const [exportedAs, setExportedAs] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDeclined, setDeleteDeclined] = useState(false);
  const { confirm: confirmAction, dialog: confirmActionDialog } = useConfirmAction();
  const [localDataPath, setLocalDataPath] = useState<string | null>(null);
  const [localDataPathUnavailable, setLocalDataPathUnavailable] = useState(false);
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

  useEffect(() => {
    if (!isTauri) return;

    let mounted = true;
    void appDataDir()
      .then((path) => {
        if (!mounted) return;
        const normalizedPath = path.trim();
        if (!normalizedPath) {
          setLocalDataPathUnavailable(true);
          return;
        }
        setLocalDataPath(normalizedPath);
        setLocalDataPathUnavailable(false);
      })
      .catch((error) => {
        console.error('Failed to resolve the local data directory:', error);
        if (mounted) setLocalDataPathUnavailable(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const deleteAllLocalData = async () => {
    setDeleting(true);
    setDeleteError(null);
    setDeleteDeclined(false);
    let deleted = false;
    try {
      deleted = await deleteLocalData();
    } catch (err) {
      setDeleteError(`The deletion did not finish, and you can run it again. ${hostMessage(err)}`);
      setDeleting(false);
      return;
    }
    if (!deleted) {
      setDeleteDeclined(true);
      setDeleting(false);
      return;
    }
    await Promise.allSettled([
      settings.settingsV2ClearCache(),
      analyticsDeleteAllData(),
      useAuthStore.getState().signOut(),
    ]);
    localStorage.clear();
    sessionStorage.clear();
    await relaunchApp();
  };

  const handleDeleteAllData = () => {
    confirmAction({
      title: 'Delete all data on this device?',
      description:
        'This removes every conversation, memory and project, your saved API keys and credentials, your settings, and the files AGI Workforce stored in its own data folders on this device, with its log of the terminal commands it ran. None of it can be recovered. You are signed out and the app restarts as if newly installed. Not removed: installed extensions, downloaded speech models, the settings, hooks, skills and agents shared with the command-line tool, and temporary files, which the system clears. A Cloud account, if you have one, is not deleted: delete it with Manage Cloud privacy, under Cloud account data on this page. Your system asks you once more before anything is deleted.',
      confirmLabel: 'Delete all data',
      destructive: true,
      onConfirm: deleteAllLocalData,
    });
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

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportedAs(null);
    try {
      setExportedAs(await exportLocalData());
    } catch (err) {
      setExportError(`Your data was not exported. ${hostMessage(err)}`);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div>
      <h3 className="text-h3 mb-4">Data &amp; Privacy</h3>
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
              <h4 className="font-semibold mb-2">Export your data</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Saves one JSON file, where you choose, with what AGI Workforce keeps for you on this
                device: conversations, memories, projects, settings and history, your schedules and
                saved knowledge, app permissions and trusted workflows, and the two settings files
                it shares with the command-line tool.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Passwords, API keys, tokens and sign-in sessions are left out; a field that held one
                reads [redacted], and a web address is saved without its sign-in details or query.
                Not in the file: attachments and generated files, what you approved or consented to
                (hooks, servers, tools and computer use), the log of terminal commands, other files
                in the app data folder such as logs and caches, and installed extensions and skills.
              </p>
              <Button onClick={() => void handleExportData()} disabled={exporting} size="sm">
                {exporting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Exporting
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export data
                  </>
                )}
              </Button>
              {exportedAs ? (
                <p role="status" className="mt-3 text-sm text-foreground">
                  Saved as {exportedAs}.
                </p>
              ) : null}
              {exportError ? (
                <p role="alert" className="mt-3 text-sm text-danger-text">
                  {exportError}
                </p>
              ) : null}
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
              <code
                aria-live="polite"
                className="block rounded bg-secondary px-3 py-2 text-xs font-mono"
              >
                {localDataPath ??
                  (localDataPathUnavailable
                    ? 'Application data directory unavailable'
                    : 'Loading local data directory…')}
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

        {/* Cloud sync toggle removed for v1 LOCAL ONLY. Re-add when cloud is ungated. */}

        <div className="rounded-lg border border-danger-fill/20 bg-danger-fill/5 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-danger-fill/10 p-3">
              <Database className="h-6 w-6 text-danger-text" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2 text-danger-text">
                Delete all data on this device
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Erases everything AGI Workforce keeps on this device, signs you out and restarts the
                app as if newly installed. A Cloud account is not affected.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteAllData}
                disabled={deleting}
              >
                {deleting ? 'Deleting' : 'Delete all data'}
              </Button>
              {deleteDeclined ? (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  Nothing was deleted.
                </p>
              ) : null}
              {deleteError ? (
                <p role="alert" className="mt-3 text-sm text-danger-text">
                  {deleteError}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Privacy &amp; Security</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
              <span>Chat history and settings are stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
              <span>Integration credentials are encrypted and stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
              <span>You can export your data at any time in standard JSON format</span>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-warning-fill/50 bg-warning-fill/10 p-4">
          <h4 className="font-semibold text-warning-text mb-2">GDPR Compliance</h4>
          <p className="text-sm text-warning-text">
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
      {confirmActionDialog}
    </div>
  );
}

interface PrivacyTabProps {
  scope?: 'local' | 'cloud';
}

function AnalyticsPrivacySection() {
  return (
    <div className="pt-6 border-t border-border">
      <h3 className="text-h3 mb-4">App analytics</h3>
      <p className="text-sm text-muted-foreground mb-4">
        This device-wide preference applies to both Local and Cloud mode.
      </p>
      <Suspense fallback={<Fallback label="Loading analytics settings..." />}>
        <LazyAnalyticsSettings />
      </Suspense>
    </div>
  );
}

function GovernancePrivacySection({ scope }: { scope: 'local' | 'cloud' }) {
  const [governanceOpen, setGovernanceOpen] = useState(false);
  if (scope === 'cloud') {
    return (
      <div className="pt-6 border-t border-border">
        <h3 className="text-h3 mb-1">Managed approvals &amp; governance</h3>
        <p className="text-sm text-muted-foreground">
          Cloud tool policy is enforced by the managed service and approval requests appear in the
          conversation transcript. Local remembered approvals, device tool history, and the Local
          governance workspace do not change Cloud policy.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-6 border-t border-border">
      <h3 className="text-h3 mb-1">Governance &amp; Compliance</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Approvals, audit events, and execution history for this device.
      </p>
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-sm font-medium">Approvals, audit and tool history</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Review pending approvals, audit integrity, and execution history.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setGovernanceOpen((open) => !open)}
            aria-expanded={governanceOpen}
          >
            {governanceOpen ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>
      {governanceOpen && (
        <div className="pt-4">
          <Suspense fallback={<Fallback label="Loading governance..." />}>
            <LazyGovernanceDashboard />
          </Suspense>
        </div>
      )}
      <div className="pt-6">
        <Suspense fallback={<Fallback label="Loading governance policies..." />}>
          <LazySafetyPolicies />
        </Suspense>
      </div>
    </div>
  );
}

export function PrivacyTab({ scope = 'local' }: PrivacyTabProps) {
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);

  if (scope === 'cloud') {
    return (
      <>
        <div>
          <h3 className="text-h3 mb-1">Cloud data &amp; privacy</h3>
          <p className="text-sm text-muted-foreground">
            These controls apply to synced chats, projects, files, and account data stored in AGI
            Cloud. Local chats, provider keys, allowed folders, and the local database remain
            device-only and are managed in Local settings.
          </p>
        </div>
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading cloud account data controls..." />}>
            <LazyCloudDataSection />
          </Suspense>
        </div>
        <AnalyticsPrivacySection />
        <GovernancePrivacySection scope="cloud" />
      </>
    );
  }

  return (
    <>
      <div>
        <h3 className="text-h3 mb-1">Master Password</h3>
        <p className="text-sm text-muted-foreground mb-4">{MASTER_PASSWORD_SCOPE}</p>
        <Suspense fallback={<Fallback label="Loading security settings..." />}>
          <LazyMasterPasswordSettings />
        </Suspense>
      </div>
      <div className="pt-6 border-t border-border">
        <DataPrivacySection />
      </div>
      {hasCloudAccountSession && (
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading cloud account data controls..." />}>
            <LazyCloudDataSection />
          </Suspense>
        </div>
      )}
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
      <AnalyticsPrivacySection />
      <GovernancePrivacySection scope="local" />
    </>
  );
}
