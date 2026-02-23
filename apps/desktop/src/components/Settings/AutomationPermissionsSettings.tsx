import { invoke } from '@/lib/tauri-mock';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '../ui/Button';

interface AutomationPermissions {
  accessibility: boolean;
  screen_recording: boolean;
  input_monitoring: boolean;
}

interface PermissionRowProps {
  label: string;
  description: string;
  granted: boolean;
  kind: string;
  onRequest: (kind: string) => void;
  requesting: boolean;
}

function PermissionRow({
  label,
  description,
  granted,
  kind,
  onRequest,
  requesting,
}: PermissionRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5">
          {granted ? (
            <div className="rounded-full bg-green-500/10 p-1">
              <Check className="h-3.5 w-3.5 text-green-500" />
            </div>
          ) : (
            <div className="rounded-full bg-orange-500/10 p-1">
              <X className="h-3.5 w-3.5 text-orange-500" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {!granted && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={requesting}
          onClick={() => onRequest(kind)}
        >
          {requesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
          Grant
        </Button>
      )}
    </div>
  );
}

export function AutomationPermissionsSettings() {
  const [permissions, setPermissions] = useState<AutomationPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<AutomationPermissions>('check_automation_permissions');
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
    async (kind: string) => {
      setRequesting(kind);
      try {
        await invoke('request_automation_permission', { kind });
        // Re-check after a short delay to give the user time to toggle in Settings
        setTimeout(() => void refresh(), 2000);
      } catch (err) {
        console.error('Failed to open System Settings:', err);
      } finally {
        setRequesting(null);
      }
    },
    [refresh],
  );

  const allGranted =
    permissions?.accessibility && permissions?.screen_recording && permissions?.input_monitoring;

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
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Agent mode requires macOS system permissions to control your computer. Click{' '}
        <strong>Grant</strong> to open the relevant System Settings pane, then enable the toggle for
        this app.
      </p>

      {loading && !permissions ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking permissions...</span>
        </div>
      ) : (
        <div>
          <PermissionRow
            label="Accessibility"
            description="Required for keyboard/mouse automation and UI interaction. Enable in System Settings → Privacy & Security → Accessibility."
            granted={permissions?.accessibility ?? false}
            kind="accessibility"
            onRequest={handleRequest}
            requesting={requesting === 'accessibility'}
          />
          <PermissionRow
            label="Screen Recording"
            description="Required for taking screenshots and visual verification during agent tasks. Enable in System Settings → Privacy & Security → Screen Recording."
            granted={permissions?.screen_recording ?? false}
            kind="screen_recording"
            onRequest={handleRequest}
            requesting={requesting === 'screen_recording'}
          />
          <PermissionRow
            label="Input Monitoring"
            description="Required for keyboard and mouse simulation during automation. Enable in System Settings → Privacy & Security → Input Monitoring."
            granted={permissions?.input_monitoring ?? false}
            kind="input_monitoring"
            onRequest={handleRequest}
            requesting={requesting === 'input_monitoring'}
          />
        </div>
      )}

      {allGranted && (
        <p className="mt-4 text-xs text-green-600 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" />
          All permissions granted — agent mode is ready.
        </p>
      )}

      {!allGranted && !loading && (
        <p className="mt-4 text-xs text-muted-foreground">
          After granting permissions in System Settings, click <strong>Refresh</strong> to update
          the status. You may need to restart the app for changes to take effect.
        </p>
      )}
    </div>
  );
}
