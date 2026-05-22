import { Globe, Loader2, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useExtensionEvents } from '../../hooks/useExtensionEvents';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';
import { cn } from '../../lib/utils';

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

export function BrowserActivityBadge() {
  const {
    currentPageUrl,
    currentPageTitle,
    lastAction,
    agentStatus,
    extensionConnected,
    hasError,
  } = useExtensionEvents();
  const open = useExecutionSidecarStore((state) => state.open);
  const setActiveContext = useExecutionSidecarStore((state) => state.setActiveContext);
  const setUserOverrideContext = useExecutionSidecarStore((state) => state.setUserOverrideContext);

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

  const handleOpen = () => {
    open();
    setActiveContext('browser');
    setUserOverrideContext('browser');
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
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
