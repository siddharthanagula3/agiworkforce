'use client';

import { ApprovalCard, Badge, Button, Skeleton } from '@agiworkforce/ui';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import type { ManagedCloudScheduleRunApproval } from '@agiworkforce/cloud-contracts';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Coins,
  Loader2,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import type { ScheduleRun } from '../types';
import { scheduleErrorMessage } from '../lib/schedule-error-message';
import {
  formatDateTime,
  formatDuration,
  formatRunCredits,
  formatTokenCount,
  scheduleModelLabel,
  scheduleResultText,
  scheduleRunTiming,
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

export type ScheduleApprovalDecision = ManagedCloudScheduleRunApproval['decision'];

interface ScheduleRunHistoryProps {
  state: ScheduleHistoryState;
  timezone: string;
  onRetry: () => void;
  onLoadMore: () => void;
  onResolveApproval: (run: ScheduleRun, decision: ScheduleApprovalDecision) => void;
  approvalPending: boolean;
}

function runStatusLabel(status: ScheduleRun['status']): string {
  return status === 'awaiting_approval' ? 'needs approval' : status;
}

function runStatusIcon(run: ScheduleRun) {
  if (run.status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-success-text" aria-hidden="true" />;
  }
  if (run.status === 'running') {
    return (
      <Loader2
        className="h-4 w-4 animate-spin text-info-text motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  }
  if (run.status === 'cancelled') {
    return <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
  if (run.status === 'awaiting_approval') {
    return <ShieldQuestion className="h-4 w-4 text-warning-text" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />;
}

export function RunRow({
  run,
  timezone,
  onResolveApproval,
  approvalPending,
  scheduleName,
}: {
  run: ScheduleRun;
  timezone: string;
  onResolveApproval: (run: ScheduleRun, decision: ScheduleApprovalDecision) => void;
  approvalPending: boolean;
  scheduleName?: string;
}) {
  const resultText = scheduleResultText(run);
  const pendingApproval = run.status === 'awaiting_approval' ? run.pendingApproval : null;
  const usage = scheduleRunUsage(run);
  const timing = scheduleRunTiming(run, timezone);
  return (
    <li className="rounded-xl border border-border/70 bg-background/70 p-3">
      {scheduleName ? (
        <p className="mb-1.5 break-words text-sm font-medium text-foreground">{scheduleName}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {runStatusIcon(run)}
        <Badge
          variant={run.status === 'failed' || run.status === 'timeout' ? 'destructive' : 'outline'}
        >
          {timing?.skipped ? 'skipped' : runStatusLabel(run.status)}
        </Badge>
        <span>{formatDateTime(run.startedAt, timezone)}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDuration(run.durationMs)}
        </span>
        <span aria-hidden="true">·</span>
        <span className="capitalize">{run.triggerSource}</span>
        {usage?.credits !== null && usage?.credits !== undefined && (
          <>
            <span aria-hidden="true">·</span>
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              title={
                usage.model
                  ? `${formatRunCredits(usage.credits)} on ${scheduleModelLabel(usage.model)}`
                  : formatRunCredits(usage.credits)
              }
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              {formatRunCredits(usage.credits)}
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
            <span className="truncate">{scheduleModelLabel(usage.model)}</span>
          </>
        )}
      </div>
      {pendingApproval ? (
        <ApprovalCard
          className="mt-2"
          title="Waiting for your approval"
          requests={pendingApproval.toolCalls.map((call) => ({
            id: call.id,
            name: call.summary,
            detail: call.name,
          }))}
          approveLabel={TOOL_APPROVAL_ACTION_LABELS.approve}
          denyLabel={TOOL_APPROVAL_ACTION_LABELS.deny}
          onApprove={() => onResolveApproval(run, 'approved')}
          onDeny={() => onResolveApproval(run, 'rejected')}
          pending={approvalPending}
          meta={`Expires ${formatDateTime(pendingApproval.expiresAt, timezone)}`}
        >
          {pendingApproval.toolCalls.map((call) =>
            call.input ? (
              <pre
                key={call.id}
                className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-2 font-mono text-caption text-muted-foreground"
              >
                {call.input}
              </pre>
            ) : null,
          )}
        </ApprovalCard>
      ) : null}
      {timing ? (
        <p className="mt-2 break-words rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {timing.note}
        </p>
      ) : null}
      {run.error && !timing?.skipped && (
        <p className="mt-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-danger">
          {scheduleErrorMessage(run.error)}
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
  onResolveApproval,
  approvalPending,
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
        <p role="alert" className="text-sm text-danger">
          {scheduleErrorMessage(state.error, 'Run history could not be loaded.')} Retry to check
          this schedule again.
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
          <RunRow
            key={run.id}
            run={run}
            timezone={timezone}
            onResolveApproval={onResolveApproval}
            approvalPending={approvalPending}
          />
        ))}
      </ol>
      {state.error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-danger">
            {scheduleErrorMessage(state.error, 'More run history could not be loaded.')}
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
              className="me-2 h-4 w-4 animate-spin motion-reduce:animate-none"
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
