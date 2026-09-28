'use client';

import { useCallback, useState } from 'react';
import { Button, Skeleton } from '@agiworkforce/ui';
import { MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE } from '@agiworkforce/cloud-contracts';
import { toUserMessageWithStatus } from '@agiworkforce/unified-chat';
import type { ScheduleApi } from '../services/schedule-api';
import type { ScheduleRun, ScheduleTask } from '../types';
import { RunRow, type ScheduleApprovalDecision } from './ScheduleRunHistory';

type RecentRun = Awaited<ReturnType<ScheduleApi['listRecentRuns']>>['runs'][number];

interface RecentState {
  status: 'idle' | 'loading' | 'success' | 'error';
  runs: RecentRun[];
  error: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
}

const INITIAL: RecentState = {
  status: 'idle',
  runs: [],
  error: null,
  nextCursor: null,
  loadingMore: false,
};

export function RecentScheduleResults({
  api,
  schedules,
  fallbackTimezone,
  onResolveApproval,
}: {
  api: ScheduleApi;
  schedules: readonly ScheduleTask[];
  fallbackTimezone: string;
  onResolveApproval: (
    schedule: ScheduleTask,
    run: ScheduleRun,
    decision: ScheduleApprovalDecision,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecentState>(INITIAL);

  const load = useCallback(
    async (append: boolean) => {
      setState((current) =>
        append ? { ...current, loadingMore: true, error: null } : { ...INITIAL, status: 'loading' },
      );
      try {
        const page = await api.listRecentRuns({
          limit: MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
          cursor: append ? state.nextCursor : null,
        });
        setState((current) => ({
          status: 'success',
          runs: append ? [...current.runs, ...page.runs] : page.runs,
          error: null,
          nextCursor: page.nextCursor,
          loadingMore: false,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          status: append ? current.status : 'error',
          loadingMore: false,
          error: toUserMessageWithStatus(error, 'Recent results could not be loaded.'),
        }));
      }
    },
    [api, state.nextCursor],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state.status === 'idle') void load(false);
  };

  return (
    <section
      aria-labelledby="recent-schedule-results-heading"
      className="rounded-2xl border border-border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-schedule-results-heading" className="text-sm font-medium text-foreground">
          Recent results
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls="recent-schedule-results"
          onClick={toggle}
        >
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open ? (
        <div id="recent-schedule-results" className="mt-3">
          {state.status === 'loading' ? (
            <div className="space-y-2" role="status" aria-label="Loading recent results">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : state.status === 'error' ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
              <span>{state.error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void load(false)}>
                Retry
              </Button>
            </div>
          ) : state.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedule has run yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {state.runs.map((run) => {
                  const schedule = schedules.find((candidate) => candidate.id === run.taskId);
                  return (
                    <RunRow
                      key={run.id}
                      run={run}
                      scheduleName={run.taskName}
                      timezone={schedule?.timezone ?? fallbackTimezone}
                      approvalPending={false}
                      onResolveApproval={(selected, decision) => {
                        if (schedule) onResolveApproval(schedule, selected, decision);
                      }}
                    />
                  );
                })}
              </ul>
              {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
              {state.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={state.loadingMore}
                  onClick={() => void load(true)}
                >
                  {state.loadingMore ? 'Loading…' : 'Show more results'}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
