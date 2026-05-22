import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Code2, Globe, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import { browserExtension, type ExtensionStatusDiagnostics } from '@agiworkforce/api';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/tauri-mock';
import { useIsMounted } from '@/hooks/useIsMounted';

type BridgeState = 'connected' | 'connecting' | 'disconnected' | 'error' | 'unknown';

interface BridgeRow {
  surface: 'chrome' | 'vscode';
  label: string;
  detail: string;
  state: BridgeState;
}

const STATE_DOT: Record<BridgeState, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-500',
  disconnected: 'bg-zinc-500',
  error: 'bg-rose-500',
  unknown: 'bg-zinc-400',
};

const STATE_LABEL: Record<BridgeState, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Not connected',
  error: 'Error',
  unknown: 'Unknown',
};

function deriveChromeRow(payload: ExtensionStatusDiagnostics | null): BridgeRow {
  const native = payload?.diagnostics?.native_connection;
  const tokenValid = payload?.diagnostics?.realtime_token?.valid ?? false;
  const rawState = String(native?.state ?? 'unknown');

  let state: BridgeState;
  if (!tokenValid) state = 'error';
  else if (rawState === 'connected') state = 'connected';
  else if (rawState === 'connecting') state = 'connecting';
  else if (rawState === 'disconnected') state = 'disconnected';
  else if (rawState.startsWith('error:') || rawState === 'state_unavailable') state = 'error';
  else state = 'unknown';

  const detail = native?.extension_id
    ? `Extension ${native.extension_id.slice(0, 12)}…`
    : rawState.startsWith('error:')
      ? rawState.slice('error:'.length).trim()
      : 'Native messaging bridge';

  return {
    surface: 'chrome',
    label: 'Chrome extension',
    detail,
    state,
  };
}

function deriveVsCodeRow(payload: ExtensionStatusDiagnostics | null): BridgeRow {
  const tokenValid = payload?.diagnostics?.realtime_token?.valid ?? false;
  const port = payload?.transport?.websocket_port;
  const overallOk = payload?.status === 'ok';

  let state: BridgeState;
  if (!tokenValid) state = 'error';
  else if (overallOk && typeof port === 'number') state = 'connected';
  else if (typeof port === 'number') state = 'connecting';
  else state = 'unknown';

  const detail =
    typeof port === 'number' ? `Listening on ws://127.0.0.1:${port}` : 'Bridge port not exposed';

  return {
    surface: 'vscode',
    label: 'VS Code extension',
    detail,
    state,
  };
}

function SurfaceIcon({ surface }: { surface: BridgeRow['surface'] }) {
  if (surface === 'chrome') return <Globe className="h-4 w-4 text-muted-foreground" />;
  return <Code2 className="h-4 w-4 text-muted-foreground" />;
}

interface BridgeStatusCardProps {
  /**
   * Optional override for the fetcher. Defaults to
   * `browserExtension.extensionStatus()`. Test-friendly seam.
   */
  fetcher?: () => Promise<ExtensionStatusDiagnostics>;
  /** Optional override for the Tauri-environment gate. Test-friendly seam. */
  isTauriHost?: boolean;
}

/**
 * Renders Chrome + VS Code bridge health in the connector hub.
 *
 * Derived from the Tauri `extension_status` diagnostics payload exposed via
 * `@agiworkforce/api`'s `browserExtension.extensionStatus()`. PLAN.md section 6:
 * "Add Chrome and VS Code bridge status to connector hub."
 *
 * Both bridges share the same `.ipc_token` and the same desktop transport
 * layer, so a token error degrades both rows; per-client connection tracking
 * is currently only emitted for Chrome's native messaging — VS Code's row
 * surfaces the websocket bridge port rather than an active-client count.
 */
export function BridgeStatusCard({ fetcher, isTauriHost = isTauri }: BridgeStatusCardProps = {}) {
  const [payload, setPayload] = useState<ExtensionStatusDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unmount guard — see hooks/useIsMounted for rationale. Without this,
  // an in-flight fetcher promise that resolves after the card unmounts
  // (StrictMode double-mount in dev, fast nav, etc.) triggers a React
  // warning AND would overwrite fresher state from a new mount with
  // stale resolved values from the previous one.
  const mountedRef = useIsMounted();

  const effectiveFetcher = fetcher ?? browserExtension.extensionStatus;

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const next = await effectiveFetcher();
      if (!mountedRef.current) return;
      setPayload(next);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to read bridge status');
      setPayload(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [effectiveFetcher, mountedRef]);

  useEffect(() => {
    if (!isTauriHost) return;
    void load();
  }, [isTauriHost, load]);

  const rows = useMemo(
    () => (payload ? [deriveChromeRow(payload), deriveVsCodeRow(payload)] : []),
    [payload],
  );

  const recommendations = payload?.diagnostics?.recommendations ?? [];
  const updatedAt = payload?.timestamp;

  if (!isTauriHost) return null;

  return (
    <div className="rounded-lg border border-border bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Developer bridges</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live status of the Chrome and VS Code transport channels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs',
            'border border-border bg-background text-muted-foreground',
            'hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50',
          )}
          aria-label="Refresh bridge status"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span>Refresh</span>
        </button>
      </div>

      {/* Body */}
      {error ? (
        <div className="px-4 py-3 flex items-start gap-2 text-xs text-rose-500">
          <ShieldOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : rows.length === 0 && !loading ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          Bridge diagnostics are not available yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.surface}
              data-testid={`bridge-row-${row.surface}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <SurfaceIcon surface={row.surface} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{row.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      'border border-border bg-background text-muted-foreground',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[row.state])} />
                    {STATE_LABEL[row.state]}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{row.detail}</p>
              </div>
              {row.state === 'connected' ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : row.state === 'error' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Footer */}
      {(recommendations.length > 0 || updatedAt) && (
        <div className="border-t border-border px-4 py-2 space-y-1">
          {recommendations.length > 0 && (
            <p className="text-[11px] text-amber-500" data-testid="bridge-recommendation">
              {recommendations[0]}
            </p>
          )}
          {updatedAt && (
            <p className="text-[10px] text-muted-foreground">Last checked {updatedAt}</p>
          )}
        </div>
      )}
    </div>
  );
}
