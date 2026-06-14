/**
 * BrowserAutomationPanel.tsx
 *
 * Live status panel for the Chrome extension browser automation pipeline.
 * Mounted as the 'extension' sidecar panel in DynamicSidecar.
 *
 * Shows:
 *   - Current page URL (with favicon placeholder)
 *   - Page title
 *   - Agent status chip (planning / executing / done / error / idle)
 *   - Last action description
 *   - Stop button — calls agent_stop Tauri command
 */

import { Globe, Loader2, CheckCircle2, XCircle, Square, WifiOff, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExtensionEvents, type ExtensionAgentStatus } from '../../hooks/useExtensionEvents';

// ─── Sub-components ────────────────────────────────────────────────────────────

interface StatusChipProps {
  status: ExtensionAgentStatus;
  connected: boolean;
}

function StatusChip({ status, connected }: StatusChipProps) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <WifiOff className="h-3 w-3" />
        Extension disconnected
      </span>
    );
  }

  switch (status) {
    case 'planning':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Planning
        </span>
      );
    case 'executing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Zap className="h-3 w-3" />
          Executing
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
          <XCircle className="h-3 w-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
          Idle
        </span>
      );
  }
}

function UrlDisplay({ url, title }: { url: string | null; title: string | null }) {
  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm italic text-muted-foreground">No page detected yet</span>
      </div>
    );
  }

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep raw url
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium text-foreground" title={url}>
          {hostname}
        </span>
      </div>
      {title && (
        <p className="truncate pl-6 text-xs text-muted-foreground" title={title}>
          {title}
        </p>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface BrowserAutomationPanelProps {
  className?: string;
}

export function BrowserAutomationPanel({ className }: BrowserAutomationPanelProps) {
  const {
    currentPageUrl,
    currentPageTitle,
    lastAction,
    agentStatus,
    hasError,
    lastError,
    lastTaskActionsPerformed,
    extensionConnected,
    stopAgent,
    resetState,
  } = useExtensionEvents();

  const isActive = agentStatus === 'planning' || agentStatus === 'executing';

  return (
    <div className={cn('flex h-full flex-col gap-4 overflow-y-auto', className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Browser Agent</h2>
        <StatusChip status={agentStatus} connected={extensionConnected} />
      </div>

      {/* Current page */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Current Page
        </span>
        <UrlDisplay url={currentPageUrl} title={currentPageTitle} />
      </section>

      {/* Last action */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Last Action
        </span>
        <div className="min-h-[2.5rem] rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          {lastAction ? (
            <p className="text-sm text-foreground">{lastAction}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">Waiting for activity…</p>
          )}
        </div>
      </section>

      {/* Error banner */}
      {hasError && lastError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-destructive">
            Error
          </p>
          <p className="text-xs text-destructive">{lastError}</p>
          <button
            type="button"
            onClick={resetState}
            className="mt-2 text-[11px] text-destructive underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats row (only when there's a completed task) */}
      {agentStatus === 'done' && lastTaskActionsPerformed > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{lastTaskActionsPerformed}</span> action
          {lastTaskActionsPerformed === 1 ? '' : 's'} performed in last task
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stop button, only shown when active */}
      {isActive && (
        <button
          type="button"
          onClick={() => void stopAgent()}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
            'bg-destructive text-destructive-foreground text-sm font-medium',
            'transition-colors hover:bg-destructive/90 active:bg-destructive/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50',
          )}
          aria-label="Stop browser agent"
        >
          <Square className="h-4 w-4 fill-current" />
          Stop Agent
        </button>
      )}

      {/* Idle / disconnected hint */}
      {!isActive && !extensionConnected && (
        <p className="text-center text-xs text-muted-foreground">
          Install the AGI Workforce Chrome extension to enable browser automation.
        </p>
      )}
    </div>
  );
}

export default BrowserAutomationPanel;
