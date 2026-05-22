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
 *   - Stop button (terra-cotta #da7756) — calls agent_stop Tauri command
 *
 * Design tokens match the desktop app:
 *   - Teal  #21808d — active / focus accent
 *   - Terra-cotta #da7756 — stop / destructive
 *   - Charcoal surfaces from Tailwind dark classes
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
        <WifiOff className="h-3 w-3" />
        Extension disconnected
      </span>
    );
  }

  switch (status) {
    case 'planning':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          Planning
        </span>
      );
    case 'executing':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300">
          <Zap className="h-3 w-3" />
          Executing
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300">
          <XCircle className="h-3 w-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          Idle
        </span>
      );
  }
}

function UrlDisplay({ url, title }: { url: string | null; title: string | null }) {
  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
        <Globe className="h-4 w-4 shrink-0 text-zinc-600" />
        <span className="text-sm text-zinc-500 italic">No page detected yet</span>
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
    <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-[#21808d]" />
        <span className="truncate text-xs font-medium text-zinc-200" title={url}>
          {hostname}
        </span>
      </div>
      {title && (
        <p className="truncate text-xs text-zinc-500 pl-6" title={title}>
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
        <h2 className="text-sm font-semibold text-zinc-100">Browser Agent</h2>
        <StatusChip status={agentStatus} connected={extensionConnected} />
      </div>

      {/* Current page */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Current Page
        </span>
        <UrlDisplay url={currentPageUrl} title={currentPageTitle} />
      </section>

      {/* Last action */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Last Action
        </span>
        <div className="min-h-[2.5rem] rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
          {lastAction ? (
            <p className="text-sm text-zinc-200">{lastAction}</p>
          ) : (
            <p className="text-sm italic text-zinc-500">Waiting for activity…</p>
          )}
        </div>
      </section>

      {/* Error banner */}
      {hasError && lastError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-red-400">
            Error
          </p>
          <p className="text-xs text-red-300">{lastError}</p>
          <button
            type="button"
            onClick={resetState}
            className="mt-2 text-[11px] text-red-400 underline hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats row (only when there's a completed task) */}
      {agentStatus === 'done' && lastTaskActionsPerformed > 0 && (
        <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">{lastTaskActionsPerformed}</span> action
          {lastTaskActionsPerformed === 1 ? '' : 's'} performed in last task
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stop button — terra-cotta, only shown when active */}
      {isActive && (
        <button
          type="button"
          onClick={() => void stopAgent()}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5',
            'bg-[#da7756] text-white text-sm font-medium',
            'transition-colors hover:bg-[#c56a47] active:bg-[#b35e3e]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#da7756]/50',
          )}
          aria-label="Stop browser agent"
        >
          <Square className="h-4 w-4 fill-current" />
          Stop Agent
        </button>
      )}

      {/* Idle / disconnected hint */}
      {!isActive && !extensionConnected && (
        <p className="text-center text-xs text-zinc-600">
          Install the AGI Workforce Chrome extension to enable browser automation.
        </p>
      )}
    </div>
  );
}

export default BrowserAutomationPanel;
