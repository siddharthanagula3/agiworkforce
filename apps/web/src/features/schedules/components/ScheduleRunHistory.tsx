'use client';

import { useState } from 'react';
import { Button } from '@shared/ui/button';
import { CheckCircle2, XCircle, Loader2, Play, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { formatDate, formatDuration } from '../types';
import type { ScheduleRun } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleRunHistoryProps {
  scheduleId: string;
  runs: ScheduleRun[];
  loading: boolean;
  onRerun: (run: ScheduleRun) => void;
}

// ---------------------------------------------------------------------------
// Sub-component: single run row
// ---------------------------------------------------------------------------

function RunRow({ run, onRerun }: { run: ScheduleRun; onRerun: (run: ScheduleRun) => void }) {
  const [expanded, setExpanded] = useState(false);

  const isSuccess = run.status === 'success';
  const isFailed = run.status === 'failed' || run.status === 'error';
  const hasOutput = Boolean(run.result || run.error);

  return (
    <div className="rounded-md border border-border/40 bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        {/* Status + time */}
        <div className="flex items-center gap-2 min-w-0">
          {isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : isFailed ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />
          )}
          <span className="capitalize text-muted-foreground">{run.status}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{formatDate(run.startedAt)}</span>
          {run.durationMs != null && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(run.durationMs)}
              </span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRerun(run)}
            title="Re-run schedule now"
          >
            <Play className="h-3 w-3" />
          </Button>
          {hasOutput && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Hide output' : 'Show output'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Expandable output */}
      {expanded && hasOutput && (
        <div className="border-t border-border/30 px-3 pb-2 pt-2">
          {run.error && <p className="font-mono text-xs text-red-400 break-words">{run.error}</p>}
          {run.result && !run.error && (
            <p className="font-mono text-xs text-muted-foreground break-words line-clamp-6">
              {run.result}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScheduleRunHistory({
  scheduleId: _scheduleId,
  runs,
  loading,
  onRerun,
}: ScheduleRunHistoryProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="py-2 text-center text-xs text-muted-foreground">
        No runs yet for this schedule.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Recent Runs</p>
      {runs.map((run) => (
        <RunRow key={run.id} run={run} onRerun={onRerun} />
      ))}
    </div>
  );
}

export default ScheduleRunHistory;
