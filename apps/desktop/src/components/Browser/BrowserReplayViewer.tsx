/**
 * BrowserReplayViewer
 *
 * Shows a chronological replay of browser automation actions with:
 * - Timestamp, action type, target element, screenshot thumbnail
 * - Status indicators: success (green), failed (red), skipped (yellow)
 * - Export replay as JSON for debugging
 */
import { useCallback, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Globe,
  Keyboard,
  Loader2,
  MousePointer2,
  Play,
  SkipForward,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  useBrowserStore,
  selectBrowserActions,
  selectScreenshots,
  type BrowserAction,
  type ActionType,
} from '../../stores/browserStore';

// ── Action type icons ─────────────────────────────────────────────────────────

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  navigate: Globe,
  click: MousePointer2,
  type: Keyboard,
  extract: Download,
  screenshot: Camera,
  scroll: Play,
  wait: Clock,
  execute: Play,
};

const ACTION_LABELS: Record<ActionType, string> = {
  navigate: 'Navigate',
  click: 'Click',
  type: 'Type',
  extract: 'Extract',
  screenshot: 'Screenshot',
  scroll: 'Scroll',
  wait: 'Wait',
  execute: 'Execute',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusConfig(success: boolean) {
  return success
    ? { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-400/10', label: 'Success' }
    : { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/10', label: 'Failed' };
}

// ── Screenshot thumbnail modal ────────────────────────────────────────────────

interface ScreenshotModalProps {
  src: string;
  onClose: () => void;
}

function ScreenshotModal({ src, onClose }: ScreenshotModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot preview"
    >
      <div className="relative max-w-4xl max-h-[90vh] overflow-auto rounded-lg">
        <img
          src={`data:image/png;base64,${src}`}
          alt="Browser screenshot"
          className="rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          aria-label="Close screenshot"
        >
          <XCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

interface ActionRowProps {
  action: BrowserAction;
  index: number;
  screenshotData: string | undefined;
  onViewScreenshot: (data: string) => void;
}

function ActionRow({ action, index, screenshotData, onViewScreenshot }: ActionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const statusConf = getStatusConfig(action.success);
  const StatusIcon = statusConf.icon;
  const TypeIcon = ACTION_ICONS[action.type] ?? Play;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/5"
      >
        {/* Step number */}
        <span className="w-6 shrink-0 text-center text-[10px] font-mono text-muted-foreground/50">
          {index + 1}
        </span>

        {/* Status dot */}
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            statusConf.bgColor,
          )}
        >
          <StatusIcon className={cn('h-3 w-3', statusConf.color)} />
        </span>

        {/* Action type badge */}
        <span className="flex items-center gap-1 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <TypeIcon className="h-2.5 w-2.5" />
          {ACTION_LABELS[action.type]}
        </span>

        {/* Primary description */}
        <span className="flex-1 truncate text-xs text-foreground/80">
          {action.details.url ??
            action.details.selector ??
            action.details.text ??
            action.details.script ??
            '—'}
        </span>

        {/* Duration */}
        {action.duration !== undefined && (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {formatDurationMs(action.duration)}
          </span>
        )}

        {/* Timestamp */}
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {formatTimestamp(action.timestamp)}
        </span>

        {/* Screenshot thumb */}
        {screenshotData && (
          <button
            type="button"
            aria-label="View screenshot"
            onClick={(e) => {
              e.stopPropagation();
              onViewScreenshot(screenshotData);
            }}
            className="shrink-0 rounded overflow-hidden border border-white/10 hover:border-white/30 transition"
          >
            <img
              src={`data:image/png;base64,${screenshotData}`}
              alt="step screenshot"
              className="h-8 w-12 object-cover"
            />
          </button>
        )}

        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </button>

      {expanded && (
        <div className="bg-white/[0.02] px-3 pb-3 pt-1 border-t border-white/5">
          <div className="space-y-1.5 pl-8">
            {action.details.url && (
              <div className="text-xs">
                <span className="text-muted-foreground">URL: </span>
                <span className="font-mono text-foreground/80 break-all">{action.details.url}</span>
              </div>
            )}
            {action.details.selector && (
              <div className="text-xs">
                <span className="text-muted-foreground">Selector: </span>
                <code className="rounded bg-white/5 px-1 py-0.5 text-[11px] text-foreground/80">
                  {action.details.selector}
                </code>
              </div>
            )}
            {action.details.text && (
              <div className="text-xs">
                <span className="text-muted-foreground">Text: </span>
                <span className="text-foreground/80">{action.details.text}</span>
              </div>
            )}
            {action.details.error && (
              <div className="flex items-start gap-1.5 rounded bg-red-900/20 px-2 py-1.5 text-xs text-red-400">
                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {action.details.error}
              </div>
            )}
            {action.details.result !== undefined && (
              <div className="text-xs">
                <span className="text-muted-foreground">Result: </span>
                <span className="text-foreground/80">
                  {typeof action.details.result === 'string'
                    ? action.details.result
                    : JSON.stringify(action.details.result)}
                </span>
              </div>
            )}

            {/* Full screenshot if present */}
            {screenshotData && (
              <button
                type="button"
                onClick={() => onViewScreenshot(screenshotData)}
                className="mt-2 flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-xs text-muted-foreground hover:border-white/30 hover:text-foreground transition"
              >
                <ZoomIn className="h-3 w-3" />
                View full screenshot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface BrowserReplayViewerProps {
  className?: string;
}

export function BrowserReplayViewer({ className }: BrowserReplayViewerProps) {
  const actions = useBrowserStore(selectBrowserActions);
  const screenshots = useBrowserStore(selectScreenshots);
  const clearActions = useBrowserStore((s) => s.clearActions);

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // Map screenshotId -> screenshot data for O(1) lookup
  const screenshotMap = new Map(screenshots.map((s) => [s.id, s.data]));

  const handleExport = useCallback(() => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        actionCount: actions.length,
        actions: actions.map((a) => ({
          id: a.id,
          type: a.type,
          timestamp: a.timestamp,
          duration: a.duration,
          success: a.success,
          details: {
            url: a.details.url,
            selector: a.details.selector,
            text: a.details.text,
            error: a.details.error,
          },
          hasScreenshot: Boolean(a.screenshotId),
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `browser-replay-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Replay exported');
    } catch (err) {
      console.error('[BrowserReplayViewer] Export failed:', err);
      toast.error('Export failed');
    }
  }, [actions]);

  const handleClear = useCallback(() => {
    clearActions();
    toast.info('Action log cleared');
  }, [clearActions]);

  if (actions.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-12 text-center',
          className,
        )}
      >
        <SkipForward className="h-8 w-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">No browser actions recorded yet</p>
        <p className="text-xs text-muted-foreground/60">
          Actions will appear here as the agent interacts with the browser
        </p>
      </div>
    );
  }

  const successCount = actions.filter((a) => a.success).length;
  const failedCount = actions.length - successCount;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {successCount}
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <XCircle className="h-3 w-3" />
              {failedCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <Download className="h-3 w-3" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Action list */}
      <div className="divide-y divide-white/[0.03] overflow-y-auto">
        {actions.map((action, index) => (
          <ActionRow
            key={action.id}
            action={action}
            index={index}
            screenshotData={
              action.screenshotId ? screenshotMap.get(action.screenshotId) : undefined
            }
            onViewScreenshot={setPreviewSrc}
          />
        ))}
      </div>

      {/* Screenshot modal */}
      {previewSrc && <ScreenshotModal src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}

// Skeleton loader used while browser session initializes
export function BrowserReplayViewerSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-md bg-white/5 px-3 py-2.5 animate-pulse"
        >
          <div className="h-5 w-5 rounded-full bg-white/10" />
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="h-3 flex-1 rounded bg-white/10" />
          <div className="h-3 w-12 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

// Loading state
export function BrowserReplayViewerLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading browser session...
    </div>
  );
}
