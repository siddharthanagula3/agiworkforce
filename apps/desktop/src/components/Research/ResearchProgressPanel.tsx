/**
 * ResearchProgressPanel
 *
 * Live progress panel shown while a deep research session is running.
 * Displays animated status, step progress bar, current step message,
 * and a real-time list of sources discovered so far.
 */
import { memo } from 'react';
import { Globe, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import type { ResearchProgress } from '@/stores/researchStore';

/** Minimal source shape needed for live display during a research session */
export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export interface ResearchProgressPanelProps {
  progress: ResearchProgress | null;
  sources: ResearchSource[];
  onCancel?: () => void;
  className?: string;
}

export const ResearchProgressPanel = memo(function ResearchProgressPanel({
  progress,
  sources,
  onCancel,
  className,
}: ResearchProgressPanelProps) {
  const percent = progress?.progress_percent ?? 0;
  const statusMessage = progress
    ? PHASE_LABELS[progress.phase] ?? progress.status_message
    : 'Starting research...';

  return (
    <div className={cn('flex flex-col gap-4 p-4', className)}>
      {/* Animated header */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Researching...</p>
          <p className="text-xs text-slate-400 truncate">{statusMessage}</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-red-400"
            aria-label="Cancel research"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{statusMessage}</span>
          <span>{percent}%</span>
        </div>
        <Progress
          value={percent}
          className="h-1.5 bg-white/10"
          indicatorClassName="bg-indigo-500 transition-all duration-500"
        />
        {progress && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{progress.sources_found} sources found</span>
            {progress.elapsed_secs > 0 && (
              <span>
                {Math.floor(progress.elapsed_secs / 60) > 0
                  ? `${Math.floor(progress.elapsed_secs / 60)}m ${progress.elapsed_secs % 60}s`
                  : `${progress.elapsed_secs}s`}{' '}
                elapsed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sources discovered so far */}
      {sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Sources discovered</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {sources.map((source, idx) => (
              <LiveSourceRow key={`${source.url}-${idx}`} source={source} />
            ))}
          </div>
        </div>
      )}

      {/* Active agents */}
      {progress && progress.active_agents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {progress.active_agents.map((agent) => (
            <Badge
              key={agent}
              variant="outline"
              className="flex items-center gap-1 border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300"
            >
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {formatAgentName(agent)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
});

interface LiveSourceRowProps {
  source: ResearchSource;
}

function LiveSourceRow({ source }: LiveSourceRowProps) {
  const domain = (() => {
    try {
      return new URL(source.url).hostname;
    } catch {
      return source.url;
    }
  })();

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/5 px-2.5 py-1.5">
      <img
        src={faviconUrl}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded-sm"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500 hidden" />
      <span className="flex-1 truncate text-xs text-slate-300">{source.title || domain}</span>
      <RelevanceDot score={source.relevanceScore} />
    </div>
  );
}

function RelevanceDot({ score }: { score: number }) {
  const color =
    score >= 0.8
      ? 'bg-emerald-400'
      : score >= 0.5
        ? 'bg-yellow-400'
        : 'bg-red-400';

  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)}
      title={`Relevance: ${Math.round(score * 100)}%`}
    />
  );
}

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Setting up...',
  analyzing_query: 'Analyzing your question...',
  searching: 'Searching across sources...',
  collecting_results: 'Gathering findings...',
  synthesizing: 'Synthesizing insights...',
  generating_report: 'Writing report...',
  complete: 'Research complete',
  failed: 'Research failed',
  cancelled: 'Research cancelled',
};

function formatAgentName(agent: string): string {
  return agent
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
