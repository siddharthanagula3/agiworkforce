/**
 * DataSection
 *
 * Wave 2 Task 3.3 - GDPR / CCPA "Data" controls under Settings, Privacy, Data.
 *
 * Surfaces:
 *   - Export my data    → invoke('privacy_export_data') + native save dialog
 *   - Delete my account → 2 confirmations (incl. type DELETE) + 7-day grace,
 *                         banner with reversible-until date
 *   - Sentry telemetry  → toggle, persisted via onboarding.setUserPreference
 *                         and applied to errorTracking SDK immediately
 *   - Web Analytics     → toggle (only affects the web app), persisted via
 *                         onboarding.setUserPreference
 *
 * All copy here matches the disclosures in /privacy on the marketing site.
 * Do NOT change wording without updating apps/web/app/privacy/page.tsx in
 * the same commit.
 */

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  AlertTriangle,
  BarChart3,
  Bug,
  Check,
  Database,
  Download,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onboarding } from '@agiworkforce/api';
import { toast } from 'sonner';

import { errorTracking } from '../../../services/errorTracking';
import { useAuthStore } from '../../../stores/auth';
import { Button } from '../../ui/Button';
import { Switch } from '../../ui/Switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/AlertDialog';

interface PendingDeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  purgeAt: string | null;
  daysRemaining: number | null;
}

const PREF_KEY_SENTRY = 'crash_reporting_enabled';
const PREF_KEY_WEB_ANALYTICS = 'web_analytics_enabled';

function formatPurgeDate(iso: string | null): string {
  if (!iso) return 'unknown date';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function DataSection() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  // ── Export ──────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const exportSuccessTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportSuccessTimer.current) window.clearTimeout(exportSuccessTimer.current);
    };
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const json = await invoke<string>('privacy_export_data');
      const filename = `agiworkforce-export-${new Date().toISOString().slice(0, 10)}.json`;

      const savePath = await save({
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (savePath) {
        await writeTextFile(savePath, json);
        setExportSuccess(true);
        if (exportSuccessTimer.current) window.clearTimeout(exportSuccessTimer.current);
        exportSuccessTimer.current = window.setTimeout(() => setExportSuccess(false), 5000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg);
      toast.error('Export failed', { description: msg });
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Pending deletion status ─────────────────────────────────────────────
  const [pendingStatus, setPendingStatus] = useState<PendingDeletionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const refreshPendingStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await invoke<PendingDeletionStatus>('privacy_get_pending_deletion');
      setPendingStatus(status);
    } catch (err) {
      // Soft fail: assume no pending deletion. Surface log only.
      console.warn('[DataSection] privacy_get_pending_deletion failed', err);
      setPendingStatus({
        pending: false,
        requestedAt: null,
        purgeAt: null,
        daysRemaining: null,
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPendingStatus();
  }, [refreshPendingStatus]);

  // ── Delete account flow (2 confirmations) ───────────────────────────────
  const [confirm1Open, setConfirm1Open] = useState(false);
  const [confirm2Open, setConfirm2Open] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [cancellingDelete, setCancellingDelete] = useState(false);

  const handleConfirmStep1 = useCallback(() => {
    setConfirm1Open(false);
    setConfirmText('');
    setConfirm2Open(true);
  }, []);

  const handleConfirmStep2 = useCallback(async () => {
    if (confirmText !== 'DELETE') return;
    setSubmittingDelete(true);
    try {
      const status = await invoke<PendingDeletionStatus>('privacy_request_account_deletion', {
        userId,
      });
      setPendingStatus(status);
      setConfirm2Open(false);
      setConfirmText('');
      toast.success('Account marked for deletion', {
        description: `Reversible until ${formatPurgeDate(status.purgeAt)}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to mark account for deletion', { description: msg });
    } finally {
      setSubmittingDelete(false);
    }
  }, [confirmText, userId]);

  const handleCancelDeletion = useCallback(async () => {
    setCancellingDelete(true);
    try {
      await invoke('privacy_cancel_pending_deletion');
      await refreshPendingStatus();
      toast.success('Account deletion cancelled');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to cancel deletion', { description: msg });
    } finally {
      setCancellingDelete(false);
    }
  }, [refreshPendingStatus]);

  // ── Sentry telemetry toggle ─────────────────────────────────────────────
  const [sentryEnabled, setSentryEnabled] = useState<boolean>(() => {
    return errorTracking.getConfig().enabled;
  });
  const [savingSentry, setSavingSentry] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const result = (await onboarding.getUserPreference(PREF_KEY_SENTRY)) as {
          value: string;
        } | null;
        if (result && mounted) {
          const enabled = result.value === 'true';
          setSentryEnabled(enabled);
          errorTracking.updateConfig({ enabled });
        }
      } catch {
        if (mounted) setSentryEnabled(errorTracking.getConfig().enabled);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleSentry = useCallback(async (enabled: boolean) => {
    setSavingSentry(true);
    try {
      await onboarding.setUserPreference(
        PREF_KEY_SENTRY,
        enabled.toString(),
        'privacy',
        'boolean',
        'Send anonymized error stack traces to Sentry',
      );
      errorTracking.updateConfig({ enabled });
      setSentryEnabled(enabled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to update telemetry preference', { description: msg });
    } finally {
      setSavingSentry(false);
    }
  }, []);

  // ── Web analytics toggle ────────────────────────────────────────────────
  const [webAnalyticsEnabled, setWebAnalyticsEnabled] = useState<boolean>(true);
  const [savingWebAnalytics, setSavingWebAnalytics] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const result = (await onboarding.getUserPreference(PREF_KEY_WEB_ANALYTICS)) as {
          value: string;
        } | null;
        if (result && mounted) {
          setWebAnalyticsEnabled(result.value === 'true');
        }
      } catch {
        // default true (matches GTM presence on web)
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleWebAnalytics = useCallback(async (enabled: boolean) => {
    setSavingWebAnalytics(true);
    try {
      await onboarding.setUserPreference(
        PREF_KEY_WEB_ANALYTICS,
        enabled.toString(),
        'privacy',
        'boolean',
        'Allow Google Tag Manager to collect pageviews and clicks in the web app',
      );
      setWebAnalyticsEnabled(enabled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Failed to update analytics preference', { description: msg });
    } finally {
      setSavingWebAnalytics(false);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Data</h3>
        <p className="text-sm text-muted-foreground">
          Export your data, delete your account, and control what telemetry leaves your device. See
          the{' '}
          <a
            href="https://agiworkforce.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Privacy Policy
          </a>{' '}
          for what each toggle does.
        </p>
      </div>

      {/* Pending-deletion banner */}
      {pendingStatus?.pending && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-100">Account marked for deletion</p>
              <p className="mt-1 text-sm text-amber-200/80">
                Reversible until {formatPurgeDate(pendingStatus.purgeAt)}
                {typeof pendingStatus.daysRemaining === 'number'
                  ? ` (${pendingStatus.daysRemaining} day${pendingStatus.daysRemaining === 1 ? '' : 's'} remaining)`
                  : ''}
                . After that, your conversations, settings, and subscription are permanently
                deleted.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void handleCancelDeletion()}
                disabled={cancellingDelete}
              >
                {cancellingDelete ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel deletion'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">
            <Download className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold">Export my data</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Download a JSON archive of your conversations, settings, and account metadata. Saved
              to a location you choose. This satisfies your right to data portability under GDPR and
              CCPA.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export my data
                </>
              )}
            </Button>
            {exportSuccess && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-500">
                <Check className="h-4 w-4" />
                <span>Data exported successfully.</span>
              </div>
            )}
            {exportError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
                <X className="h-4 w-4" />
                <span>{exportError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete account */}
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-red-500/10 p-3">
            <Database className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-red-500 dark:text-red-400">Delete my account</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete your conversations, settings, and subscription. We hold the request
              for 7 days so you can change your mind; after that, the data is purged from Supabase,
              your Stripe subscription is cancelled, and your authentication record is removed.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={() => setConfirm1Open(true)}
              disabled={statusLoading || pendingStatus?.pending === true}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              Delete my account
            </Button>
            {pendingStatus?.pending && (
              <p className="mt-2 text-xs text-muted-foreground">
                Already pending. Use Cancel deletion above to revert.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sentry telemetry toggle */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">
            <Bug className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold">Sentry telemetry</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send anonymized error stack traces and OS or app version to Sentry when something
                  crashes. We never send conversation content, API keys, or personal data.
                </p>
              </div>
              <Switch
                checked={sentryEnabled}
                disabled={savingSentry}
                onCheckedChange={(v) => void handleToggleSentry(v)}
                aria-label="Sentry telemetry"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Web analytics toggle */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold">Web Analytics</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Web Analytics, only affects the web app. Allows Google Tag Manager to record
                  pageviews and button clicks on agiworkforce.com. Off by default if you have Do Not
                  Track enabled in your browser.
                </p>
              </div>
              <Switch
                checked={webAnalyticsEnabled}
                disabled={savingWebAnalytics}
                onCheckedChange={(v) => void handleToggleWebAnalytics(v)}
                aria-label="Web analytics"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation 1 */}
      <AlertDialog open={confirm1Open} onOpenChange={setConfirm1Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all conversations, settings, and cancel your subscription. You have 7
              days to change your mind before the data is permanently purged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStep1}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation 2 - type DELETE */}
      <AlertDialog open={confirm2Open} onOpenChange={setConfirm2Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm account deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Type <span className="font-mono font-semibold text-red-500">DELETE</span> below to
              confirm. After 7 days the deletion cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmText('');
                setConfirm2Open(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmStep2()}
              disabled={confirmText !== 'DELETE' || submittingDelete}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 disabled:opacity-50"
            >
              {submittingDelete ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Marking for deletion...
                </>
              ) : (
                'Delete my account'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DataSection;
