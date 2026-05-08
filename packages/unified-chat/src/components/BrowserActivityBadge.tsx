/**
 * BrowserActivityBadge — Phase A Slice 5 (ported from UAC)
 *
 * Shows a pill indicator for browser extension / Cowork integration status.
 * Uses optional props instead of Tauri/desktop-specific hooks.
 * Hosts supply the state from their extension-events hook.
 */
import { Globe, Loader2, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../lib/utils';

export type BrowserAgentStatus = 'idle' | 'planning' | 'executing' | 'done';

export interface BrowserActivityBadgeProps {
  /** Current page URL (null when browser not connected or no page active). */
  currentPageUrl?: string | null;
  /** Current page title (used for tooltip). */
  currentPageTitle?: string | null;
  /** Last action performed by the agent (used for tooltip). */
  lastAction?: string | null;
  /** Current browser agent status. */
  agentStatus?: BrowserAgentStatus;
  /** Whether the Chrome extension is connected. */
  extensionConnected?: boolean;
  /** Whether there is a browser error. */
  hasError?: boolean;
  /** Called when the user clicks the badge (e.g., to open the browser sidecar). */
  onClick?: () => void;
}

function hostLabel(url: string | null): string {
  if (!url) {
    return 'Browser ready';
  }
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function BrowserActivityBadge({
  currentPageUrl = null,
  currentPageTitle = null,
  lastAction = null,
  agentStatus = 'idle',
  extensionConnected = false,
  hasError = false,
  onClick,
}: BrowserActivityBadgeProps) {
  const label = useMemo(() => {
    const host = hostLabel(currentPageUrl);
    if (!extensionConnected) {
      return 'Browser extension disconnected';
    }
    if (agentStatus === 'planning') {
      return `Planning on ${host}`;
    }
    if (agentStatus === 'executing') {
      return `Acting on ${host}`;
    }
    if (agentStatus === 'done') {
      return host;
    }
    if (hasError) {
      return `Browser issue on ${host}`;
    }
    return host;
  }, [agentStatus, currentPageUrl, extensionConnected, hasError]);

  // Don't render when nothing to show
  if (!extensionConnected && agentStatus === 'idle' && !currentPageUrl) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        !extensionConnected
          ? 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800'
          : agentStatus === 'planning' || agentStatus === 'executing'
            ? 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15'
            : hasError
              ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15',
      )}
      title={lastAction ?? currentPageTitle ?? label}
      aria-label="Open browser activity"
    >
      {!extensionConnected ? (
        <WifiOff className="h-3 w-3" />
      ) : agentStatus === 'planning' || agentStatus === 'executing' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Globe className="h-3 w-3" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
