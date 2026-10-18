import {
  automation,
  type AutomationCapabilitySupport,
  type AutomationPermissions,
} from '@agiworkforce/desktop-command-client';
import { Check, ExternalLink, Minus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';

type PermissionKind = 'accessibility' | 'screen_recording' | 'input_monitoring';

interface PermissionRowSpec {
  kind: PermissionKind;
  label: string;
  purpose: string;
  grantHint: string;
  unsupportedNote: string;
}

const PERMISSION_ROWS: readonly PermissionRowSpec[] = [
  {
    kind: 'accessibility',
    label: 'Accessibility',
    purpose: 'Keyboard and mouse automation and reading on-screen controls.',
    grantHint: 'Enable in System Settings → Privacy & Security → Accessibility.',
    unsupportedNote:
      'The agent cannot read or act on individual controls here. It works from screenshots instead.',
  },
  {
    kind: 'screen_recording',
    label: 'Screen Recording',
    purpose: 'Screenshots and visual verification during agent tasks.',
    grantHint: 'Enable in System Settings → Privacy & Security → Screen Recording.',
    unsupportedNote: 'The agent cannot capture the screen here.',
  },
  {
    kind: 'input_monitoring',
    label: 'Input Monitoring',
    purpose: 'Keyboard and mouse simulation during automation.',
    grantHint: 'Enable in System Settings → Privacy & Security → Input Monitoring.',
    unsupportedNote: 'The agent cannot simulate keyboard or mouse input here.',
  },
];

const SUPPORT_STATUS: Record<Exclude<AutomationCapabilitySupport, 'needs_grant'>, string> = {
  no_grant_needed: 'No permission needed on this platform',
  unsupported: 'Not supported on this platform',
};

function granted(permissions: AutomationPermissions, kind: PermissionKind): boolean {
  if (kind === 'accessibility') return permissions.accessibility;
  if (kind === 'screen_recording') return permissions.screenRecording;
  return permissions.inputMonitoring;
}

function supportFor(
  permissions: AutomationPermissions,
  kind: PermissionKind,
): AutomationCapabilitySupport {
  const support = permissions.support;
  if (!support) return 'needs_grant';
  if (kind === 'accessibility') return support.accessibility;
  if (kind === 'screen_recording') return support.screenRecording;
  return support.inputMonitoring;
}

interface PermissionRowProps {
  spec: PermissionRowSpec;
  support: AutomationCapabilitySupport;
  granted: boolean;
  onRequest: (kind: PermissionKind) => void;
  requesting: boolean;
}

function PermissionRow({ spec, support, granted, onRequest, requesting }: PermissionRowProps) {
  const needsGrant = support === 'needs_grant';
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5">
          {!needsGrant ? (
            <div className="rounded-full bg-muted p-1">
              <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
          ) : granted ? (
            <div className="rounded-full bg-success-fill/10 p-1">
              <Check className="h-3.5 w-3.5 text-success-text" aria-hidden="true" />
            </div>
          ) : (
            <div className="rounded-full bg-warning-fill/10 p-1">
              <X className="h-3.5 w-3.5 text-warning-text" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none mb-1">{spec.label}</p>
          <p className="text-xs text-muted-foreground">
            {spec.purpose}{' '}
            {needsGrant ? spec.grantHint : support === 'unsupported' ? spec.unsupportedNote : null}
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">
            {needsGrant ? (granted ? 'Granted' : 'Not granted') : SUPPORT_STATUS[support]}
          </p>
        </div>
      </div>
      {needsGrant && !granted && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={requesting}
          onClick={() => onRequest(spec.kind)}
        >
          {requesting ? <Spinner size="sm" /> : <ExternalLink className="h-3.5 w-3.5" />}
          Grant
        </Button>
      )}
    </div>
  );
}

export function AutomationPermissionsSettings() {
  const [permissions, setPermissions] = useState<AutomationPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<PermissionKind | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await automation.checkAutomationPermissions();
      setPermissions(result);
    } catch (err) {
      console.error('Failed to check automation permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRequest = useCallback(
    async (kind: PermissionKind) => {
      setRequesting(kind);
      setRequestError(null);
      try {
        await automation.requestAutomationPermission(kind);
        refreshTimerRef.current = setTimeout(() => void refresh(), 2000);
      } catch (err) {
        console.error('Failed to open System Settings:', err);
        setRequestError(
          `System Settings did not open. Open it yourself and turn on the permission for this app. ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setRequesting(null);
      }
    },
    [refresh],
  );

  const grantRows = permissions
    ? PERMISSION_ROWS.filter((spec) => supportFor(permissions, spec.kind) === 'needs_grant')
    : [];
  const platformHasGrants = grantRows.length > 0;
  const allGranted =
    permissions !== null && grantRows.every((spec) => granted(permissions, spec.kind));
  const serviceUnavailable = Boolean(
    permissions?.accessibility &&
    !permissions.automationServiceReady &&
    supportFor(permissions, 'accessibility') !== 'unsupported',
  );
  const missingWindowProgram = permissions?.support?.windowControlMissingProgram ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-semibold">Automation Permissions</h4>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-7 px-2"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          disabled={loading}
        >
          {loading ? <Spinner size="sm" /> : 'Refresh'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {permissions && !platformHasGrants ? (
          'This platform has no system permissions to grant for agent mode. The list shows what desktop control can do here.'
        ) : (
          <>
            Agent mode requires macOS system permissions to control your computer. Click{' '}
            <strong>Grant</strong> to open the relevant System Settings pane, then enable the toggle
            for this app.
          </>
        )}
      </p>

      {!permissions ? (
        loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Spinner size="sm" />
            <span>Checking permissions...</span>
          </div>
        ) : (
          <p role="alert" className="py-4 text-sm text-foreground">
            The permission status could not be read. Click <strong>Refresh</strong> to try again.
          </p>
        )
      ) : (
        <div>
          {PERMISSION_ROWS.map((spec) => (
            <PermissionRow
              key={spec.kind}
              spec={spec}
              support={supportFor(permissions, spec.kind)}
              granted={granted(permissions, spec.kind)}
              onRequest={(kind) => void handleRequest(kind)}
              requesting={requesting === spec.kind}
            />
          ))}
        </div>
      )}

      {requestError && (
        <p role="alert" className="mt-4 text-xs text-destructive">
          {requestError}
        </p>
      )}

      {missingWindowProgram && (
        <p role="status" className="mt-4 text-xs text-foreground">
          Listing and switching windows is not available: it needs{' '}
          <code className="rounded bg-muted px-1 py-0.5">{missingWindowProgram}</code>, which is not
          installed on this computer.
        </p>
      )}

      {platformHasGrants && allGranted && permissions?.automationServiceReady && (
        <p className="mt-4 text-xs text-success-text flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" />
          All permissions granted, agent mode is ready.
        </p>
      )}

      {serviceUnavailable && (
        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-foreground">
            {platformHasGrants ? 'Accessibility is granted, but the' : 'The'} automation service did
            not start. Click <strong>Refresh</strong> to try again.
          </p>
        </div>
      )}

      {platformHasGrants && !allGranted && !loading && !serviceUnavailable && (
        <p className="mt-4 text-xs text-muted-foreground">
          After granting permissions in System Settings, click <strong>Refresh</strong> to update
          the status. Accessibility takes effect without restarting AGI; macOS may ask you to reopen
          AGI after granting Screen Recording or Input Monitoring.
        </p>
      )}
    </div>
  );
}
