'use client';

import { Badge, Button, Skeleton } from '@agiworkforce/ui';
import { AlertCircle, CheckCircle2, Clock3, Coins, Loader2, XCircle } from 'lucide-react';
import type { ScheduleRun } from '../types';
import {
  formatCostCents,
  formatDateTime,
  formatDuration,
  formatTokenCount,
  scheduleResultText,
  scheduleRunUsage,
} from '../types';

export interface ScheduleHistoryState {
  status: 'idle' | 'loading' | 'success' | 'error';
  runs: ScheduleRun[];
  error: string | null;
  hasMore: boolean;
  nextOffset: number;
  loadingMore: boolean;
}

interface ScheduleRunHistoryProps {
  state: ScheduleHistoryState;
  timezone: string;
  onRetry: () => void;
  onLoadMore: () => void;
}

function runStatusIcon(run: ScheduleRun) {
  if (run.status === 'success') {
    return (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
    );
  }
  if (run.status === 'running') {
    return (
      <Loader2
        className="h-4 w-4 animate-spin text-amber-600 motion-reduce:animate-none dark:text-amber-400"
        aria-hidden="true"
      />
    );
  }
  if (run.status === 'cancelled') {
    return <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
}

function RunRow({ run, timezone }: { run: ScheduleRun; timezone: string }) {
  const resultText = scheduleResultText(run);
  // Cost and tokens have always been recorded per run; nothing displayed them.
  const usage = scheduleRunUsage(run);
  return (
    <li className="rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {runStatusIcon(run)}
        <Badge
          variant={run.status === 'failed' || run.status === 'timeout' ? 'destructive' : 'outline'}
        >
          {run.status}
        </Badge>
        <span>{formatDateTime(run.startedAt, timezone)}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDuration(run.durationMs)}
        </span>
        <span aria-hidden="true">·</span>
        <span className="capitalize">{run.triggerSource}</span>
        {usage?.costCents !== null && usage?.costCents !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              title={
                usage.model
                  ? `${formatCostCents(usage.costCents)} on ${usage.model}`
                  : formatCostCents(usage.costCents)
              }
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCostCents(usage.costCents)}
            </span>
          </>
        )}
        {usage?.totalTokens !== null && usage?.totalTokens !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatTokenCount(usage.totalTokens)} tokens</span>
          </>
        )}
        {usage?.model && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{usage.model}</span>
          </>
        )}
      </div>
      {run.error && (
        <p className="mt-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {run.error}
        </p>
      )}
      {resultText && (
        <details className="mt-2 rounded-lg bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View Output
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
            {resultText}
          </pre>
        </details>
      )}
    </li>
  );
}

export function ScheduleRunHistory({
  state,
  timezone,
  onRetry,
  onLoadMore,
}: ScheduleRunHistoryProps) {
  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading run history" className="space-y-2 py-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <span className="sr-only">Loading run history…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <p role="alert" className="text-sm text-destructive">
          {state.error ?? 'Run history could not be loaded.'} Retry to check this schedule again.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry Run History
        </Button>
      </div>
    );
  }

  if (state.status === 'success' && state.runs.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">No runs recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {state.runs.map((run) => (
          <RunRow key={run.id} run={run} timezone={timezone} />
        ))}
      </ol>
      {state.error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onLoadMore}>
            Retry Loading More Runs
          </Button>
        </div>
      )}
      {state.hasMore && !state.error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={state.loadingMore}
          aria-busy={state.loadingMore}
        >
          {state.loadingMore && (
            <Loader2
              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {state.loadingMore ? 'Loading More…' : 'Load More Runs'}
        </Button>
      )}
    </div>
  );
}

export default ScheduleRunHistory;
