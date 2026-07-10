'use client';

/**
 * ResearchActivity
 *
 * Compact activity header for Deep Research runs, rendered above the assistant
 * message while a research run streams and kept (with final counts) after it
 * completes. Mirrors the ChatGPT/Claude research UX: phase label ("Searching
 * the web...", "Writing report"), elapsed time, and search/source counts.
 * The per-round search steps render in the existing ToolTimeline and the
 * source list in the existing ResearchPanel/InlineSourcesList -- this header
 * only reports run-level state, never fabricated activity.
 */

import { useEffect, useState } from 'react';
import { Telescope, CircleAlert, CircleStop, CircleCheck } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { MessageResearchState } from '@/stores/chatStore';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const PHASE_FALLBACK_LABELS: Record<MessageResearchState['phase'], string> = {
  planning: 'Planning research',
  searching: 'Searching the web',
  synthesizing: 'Writing report',
  complete: 'Research complete',
  error: 'Research failed',
  interrupted: 'Research stopped',
};

interface ResearchActivityProps {
  research: MessageResearchState;
  /** True while the assistant message is still streaming. */
  isStreaming: boolean;
}

export function ResearchActivity({ research, isStreaming }: ResearchActivityProps) {
  const isActive =
    isStreaming &&
    (research.phase === 'planning' ||
      research.phase === 'searching' ||
      research.phase === 'synthesizing');

  // Live elapsed clock while the run is active; the server-reported elapsed_ms
  // is the anchor so the display never drifts from the actual run time.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const anchorElapsed = research.elapsedMs ?? 0;
  const startedAtMs = research.startedAt ? Date.parse(research.startedAt) : NaN;
  const liveElapsed =
    isActive && Number.isFinite(startedAtMs)
      ? Math.max(anchorElapsed, nowMs - startedAtMs)
      : anchorElapsed;

  const label = research.label || PHASE_FALLBACK_LABELS[research.phase];
  const failed = research.phase === 'error';
  const interrupted = research.phase === 'interrupted';
  const complete = research.phase === 'complete';

  const counts: string[] = [];
  if (typeof research.searches === 'number' && research.searches > 0) {
    counts.push(`${research.searches} search${research.searches === 1 ? '' : 'es'}`);
  }
  if (typeof research.sources === 'number' && research.sources > 0) {
    counts.push(`${research.sources} source${research.sources === 1 ? '' : 's'}`);
  }

  return (
    <div
      className={cn(
        'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        failed
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border/30 bg-muted/20 text-muted-foreground',
      )}
      role="status"
      aria-label={`Deep research: ${label}`}
      data-testid="research-activity"
    >
      {failed ? (
        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : interrupted ? (
        <CircleStop className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : complete ? (
        <CircleCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Telescope
          className={cn('h-3.5 w-3.5 shrink-0 text-primary', isActive && 'animate-pulse')}
          aria-hidden="true"
        />
      )}

      <span className={cn('font-medium', !failed && 'text-foreground')}>{label}</span>

      {interrupted && <span className="text-muted-foreground">(stopped by you)</span>}

      <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
        {counts.length > 0 && <span>{counts.join(' · ')}</span>}
        {liveElapsed > 0 && <span>{formatElapsed(liveElapsed)}</span>}
      </span>
    </div>
  );
}
