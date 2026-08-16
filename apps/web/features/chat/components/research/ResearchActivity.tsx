'use client';

import { useEffect, useState } from 'react';
import {
  Telescope,
  CircleAlert,
  CircleStop,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  RotateCw,
  Search,
  FileText,
} from 'lucide-react';
import type { ResearchStep } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import type { MessageResearchState } from '@shared/stores/web-chat-store';

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

const STEP_STATUS_LABELS: Record<ResearchStep['status'], string> = {
  pending: 'Queued',
  running: 'In progress',
  completed: 'Done',
  failed: 'Failed',
};

function PlanStepRow({ step }: { step: ResearchStep }) {
  const Icon =
    step.status === 'completed'
      ? CircleCheck
      : step.status === 'failed'
        ? CircleAlert
        : step.status === 'running'
          ? LoaderCircle
          : CircleDashed;
  const TypeIcon = step.type === 'synthesize' ? FileText : Search;

  return (
    <li
      className="flex items-start gap-2 py-1"
      data-testid="research-plan-step"
      data-status={step.status}
    >
      <Icon
        className={cn(
          'mt-[2px] h-3 w-3 shrink-0',
          step.status === 'completed' && 'text-primary',
          step.status === 'failed' && 'text-destructive',
          step.status === 'running' && 'animate-spin text-primary',
          step.status === 'pending' && 'text-muted-foreground/50',
        )}
        aria-hidden="true"
      />
      <TypeIcon className="mt-[2px] h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
      <span
        className={cn(
          'min-w-0 flex-1 leading-snug',
          step.status === 'pending' ? 'text-muted-foreground/70' : 'text-foreground',
          step.status === 'completed' && 'text-muted-foreground',
        )}
      >
        {step.description}
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">
        {STEP_STATUS_LABELS[step.status]}
      </span>
    </li>
  );
}

interface ResearchActivityProps {
  research: MessageResearchState;
  isStreaming: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ResearchActivity({
  research,
  isStreaming,
  onRetry,
  isRetrying = false,
}: ResearchActivityProps) {
  const isActive =
    isStreaming &&
    (research.phase === 'planning' ||
      research.phase === 'searching' ||
      research.phase === 'synthesizing');

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
    const searchLabel = `search${research.searches === 1 ? '' : 'es'}`;
    counts.push(
      isActive && typeof research.maxSearches === 'number' && research.maxSearches > 0
        ? `${research.searches} of ${research.maxSearches} ${searchLabel}`
        : `${research.searches} ${searchLabel}`,
    );
  }
  if (typeof research.sources === 'number' && research.sources > 0) {
    counts.push(`${research.sources} source${research.sources === 1 ? '' : 's'}`);
  }
  if (
    isActive &&
    typeof research.iteration === 'number' &&
    research.iteration > 0 &&
    typeof research.maxIterations === 'number' &&
    research.maxIterations > 0
  ) {
    counts.unshift(`round ${research.iteration} of ${research.maxIterations}`);
  }

  const steps = research.steps ?? [];
  const canRetry = Boolean(onRetry) && (failed || interrupted);

  return (
    <div className="mb-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
          steps.length > 0 && 'rounded-b-none border-b-0',
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
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-0.5',
                'text-[11px] font-medium text-foreground transition-colors',
                'hover:border-border hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
              )}
              data-testid="research-retry"
              aria-label="Retry this research run"
            >
              <RotateCw
                className={cn('h-3 w-3', isRetrying && 'animate-spin')}
                aria-hidden="true"
              />
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </span>
      </div>

      {steps.length > 0 && (
        <ol
          className={cn(
            'space-y-0 rounded-b-lg border border-t-0 px-3 py-2 text-xs',
            failed ? 'border-destructive/30 bg-destructive/5' : 'border-border/30 bg-muted/10',
          )}
          aria-label="Research plan"
          data-testid="research-plan"
        >
          {steps.map((step) => (
            <PlanStepRow key={step.id} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
}
