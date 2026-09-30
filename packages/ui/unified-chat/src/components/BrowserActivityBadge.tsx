import { Globe, Loader2, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../lib/utils';

export type BrowserAgentStatus = 'idle' | 'planning' | 'executing' | 'done';

export interface BrowserActivityBadgeProps {
  currentPageUrl?: string | null;
  currentPageTitle?: string | null;
  lastAction?: string | null;
  agentStatus?: BrowserAgentStatus;
  extensionConnected?: boolean;
  hasError?: boolean;
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
            ? 'border-border bg-muted text-accent-text hover:bg-muted'
            : hasError
              ? 'border-danger-fill/20 bg-danger-fill/5 text-danger-text hover:bg-danger-fill/10'
              : 'border-success-fill/20 bg-success-fill/5 text-success-text hover:bg-success-fill/10',
      )}
      title={lastAction ?? currentPageTitle ?? label}
      aria-label={`${label}, open browser activity`}
      role="status"
      aria-live="polite"
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
