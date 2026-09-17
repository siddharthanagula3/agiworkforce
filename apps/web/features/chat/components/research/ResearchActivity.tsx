'use client';

import { useEffect, useState } from 'react';
import {
  Telescope,
  CircleAlert,
  CircleStop,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ListChecks,
  LoaderCircle,
  Play,
  RotateCw,
  Search,
  FileText,
} from 'lucide-react';
import { formatCredits, runStatusLabel, type ResearchStep } from '@agiworkforce/types';
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
  awaiting_approval: 'Review the plan to start searching',
  searching: 'Searching the web',
  synthesizing: 'Writing report',
  complete: 'Research complete',
  error: 'Research failed',
  interrupted: 'Research stopped',
};

const DROPPED_STEP_LABEL = 'Not run';

const STEP_STATUS_LABELS: Record<ResearchStep['status'], string> = {
  pending: runStatusLabel('queued'),
  running: runStatusLabel('running'),
  completed: runStatusLabel('completed'),
  failed: runStatusLabel('failed'),
  dropped: DROPPED_STEP_LABEL,
};

function PlanStepRow({ step }: { step: ResearchStep }) {
  const Icon =
    step.status === 'completed'
      ? CircleCheck
      : step.status === 'failed'
        ? CircleAlert
        : step.status === 'running'
          ? LoaderCircle
          : step.status === 'dropped'
            ? CircleSlash
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
          step.status === 'failed' && 'text-danger',
          step.status === 'running' && 'animate-spin text-primary',
          step.status === 'pending' && 'text-muted-foreground',
          step.status === 'dropped' && 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <TypeIcon className="mt-[2px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        className={cn(
          'min-w-0 flex-1 leading-snug',
          step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
          step.status === 'completed' && 'text-muted-foreground',
          step.status === 'dropped' && 'text-muted-foreground',
        )}
      >
        {step.description}
        {step.status === 'dropped' && step.note ? (
          <span className="block text-[12px] text-muted-foreground">{step.note}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-[12px] uppercase tracking-wide text-muted-foreground">
        {STEP_STATUS_LABELS[step.status]}
      </span>
    </li>
  );
}

export type ResearchPlanDecision = 'start' | 'cancel';

/**
 * What the reader chose the run may read, taken at the moment they press Start
 * (§24 File sources, Domain restrictions). The server enforces both: the domain
 * list gates every source at ingestion, and files are searched only when asked
 * for, so an unanswered control changes nothing about the run.
 */
export interface ResearchPlanOptions {
  files: boolean;
  allowDomains: string[];
  denyDomains: string[];
}

const DOMAIN_SEPARATOR = /[\s,;]+/;

export function parseResearchDomainList(value: string): string[] {
  return Array.from(new Set(value.split(DOMAIN_SEPARATOR).map((part) => part.trim()))).filter(
    (part) => part.length > 0,
  );
}

interface ResearchActivityProps {
  research: MessageResearchState;
  isStreaming: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  /**
   * Answer a paused run's plan. Absent when the surface cannot send, so a
   * plan that cannot be started shows no Start button.
   */
  onPlanDecision?: (decision: ResearchPlanDecision, options?: ResearchPlanOptions) => void;
}

export function ResearchActivity({
  research,
  isStreaming,
  onRetry,
  isRetrying = false,
  onPlanDecision,
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
  if (!isActive && typeof research.credits === 'number' && Number.isFinite(research.credits)) {
    counts.push(formatCredits(research.credits, { maximumFractionDigits: 2 }));
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

  const [useMyFiles, setUseMyFiles] = useState(false);
  const [allowDomains, setAllowDomains] = useState('');
  const [denyDomains, setDenyDomains] = useState('');

  const steps = research.steps ?? [];
  const awaitingApproval = research.phase === 'awaiting_approval';
  const canRetry = Boolean(onRetry) && (failed || interrupted);
  const canDecide = Boolean(onPlanDecision) && awaitingApproval && !isStreaming;

  return (
    <div className="mb-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
          steps.length > 0 && 'rounded-b-none border-b-0',
          failed
            ? 'border-destructive/30 bg-destructive/5 text-danger'
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
        ) : awaitingApproval ? (
          <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
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
          {canDecide && (
            <>
              <button
                type="button"
                onClick={() =>
                  onPlanDecision?.('start', {
                    files: useMyFiles,
                    allowDomains: parseResearchDomainList(allowDomains),
                    denyDomains: parseResearchDomainList(denyDomains),
                  })
                }
                disabled={isRetrying}
                className={cn(
                  'inline-flex items-center gap-1 min-h-6 rounded-md bg-primary px-2 py-0.5',
                  'text-[12px] font-medium text-primary-foreground transition-opacity',
                  'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
                )}
                data-testid="research-plan-start"
                aria-label="Start searching this research plan"
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {isRetrying ? 'Starting…' : 'Start research'}
              </button>
              <button
                type="button"
                onClick={() => onPlanDecision?.('cancel')}
                disabled={isRetrying}
                className={cn(
                  'inline-flex items-center gap-1 min-h-6 rounded-md border border-border/40 px-2 py-0.5',
                  'text-[12px] font-medium text-foreground transition-colors',
                  'hover:border-border hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
                )}
                data-testid="research-plan-cancel"
                aria-label="Cancel this research plan"
              >
                Cancel
              </button>
            </>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className={cn(
                'inline-flex items-center gap-1 min-h-6 rounded-md border border-border/40 px-2 py-0.5',
                'text-[12px] font-medium text-foreground transition-colors',
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

      {canDecide && (
        <div
          className={cn(
            'flex flex-col gap-2 border border-t-0 border-border/30 bg-muted/10 px-3 py-2 text-xs',
            steps.length === 0 && 'rounded-b-lg',
          )}
          data-testid="research-plan-sources"
        >
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={useMyFiles}
              onChange={(event) => setUseMyFiles(event.target.checked)}
              data-testid="research-plan-use-files"
            />
            Also search my saved files, chats and reports
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-muted-foreground">
              Only these sites
              <input
                type="text"
                value={allowDomains}
                onChange={(event) => setAllowDomains(event.target.value)}
                placeholder="nature.com, who.int"
                className="min-h-7 w-full rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="research-plan-allow-domains"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-muted-foreground">
              Never these sites
              <input
                type="text"
                value={denyDomains}
                onChange={(event) => setDenyDomains(event.target.value)}
                placeholder="example.com"
                className="min-h-7 w-full rounded-md border border-border/40 bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="research-plan-deny-domains"
              />
            </label>
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <ol
          className={cn(
            'space-y-0 rounded-b-lg border border-t-0 px-3 py-2 text-xs',
            canDecide && 'border-t',
            failed ? 'border-destructive/30 bg-destructive/5' : 'border-border/30 bg-muted/10',
          )}
          aria-label="Research plan"
          role="status"
          aria-live="polite"
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
