import { Globe, Loader2, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';
import { cn } from '@/lib/utils';
import { useBrowserActivity } from '@/stores/browserActivityStore';

export function BrowserActivityBadge() {
  const detail = useBrowserActivity();
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);

  const label = useMemo(() => {
    const rawUrl = detail.url || 'browser';
    let host = rawUrl;
    try {
      host = new URL(rawUrl).hostname;
    } catch {
      // Keep the raw URL when it is not absolute.
    }
    if (!detail.extensionConnected && detail.status === 'idle' && !detail.active) {
      return 'Browser extension disconnected';
    }
    if (detail.status === 'planning') return `Planning on ${host}`;
    if (detail.status === 'executing') return `Acting on ${host}`;
    if (detail.status === 'error') return detail.lastAction || `Browser issue on ${host}`;
    return detail.lastAction || host;
  }, [detail.active, detail.extensionConnected, detail.lastAction, detail.status, detail.url]);

  if (!detail.active && (!detail.extensionConnected || !detail.url)) {
    return null;
  }

  const handleOpen = () => {
    openSidecar('browser', detail.url || undefined, {
      url: detail.url,
      title: detail.title,
      lastAction: detail.lastAction,
      status: detail.status,
      extensionConnected: detail.extensionConnected,
      hasError: detail.hasError,
    });
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={cn(
        'inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        !detail.extensionConnected
          ? 'border-border/70 bg-muted/60 text-muted-foreground hover:bg-muted'
          : detail.status === 'planning' || detail.status === 'executing'
            ? 'border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/15'
            : detail.hasError
              ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15',
      )}
      title={detail.lastAction ?? detail.title ?? label}
      aria-label="Open browser activity"
    >
      {!detail.extensionConnected ? (
        <WifiOff className="h-3 w-3" />
      ) : detail.status === 'planning' || detail.status === 'executing' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Globe className="h-3 w-3" />
      )}
      <span className="max-w-[180px] truncate">{label}</span>
    </button>
  );
}
