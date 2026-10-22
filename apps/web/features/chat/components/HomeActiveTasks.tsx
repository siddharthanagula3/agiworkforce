'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListChecks } from '@agiworkforce/icons';
import { Button } from '@agiworkforce/ui';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { isLiveTaskState, taskStateLabel } from '@agiworkforce/unified-chat';
import { useAuthStore } from '@shared/stores/authentication-store';
import { conversationHref } from '@shared/components/layout/sidebar-session-actions';
import {
  createWebCloudTasksClient,
  setWebCloudTaskArchived,
} from '@/features/tasks/services/cloud-tasks-client';
import { WORK_HISTORY_LABEL, WORK_HISTORY_ROUTE } from '../lib/agi-work';
import { formatListTime } from './ChatsAndTasksList';

export const HOME_ACTIVE_FETCH_LIMIT = 25;
export const HOME_ACTIVE_VISIBLE_LIMIT = 5;
export const HOME_ACTIVE_POLL_INTERVAL_MS = 15_000;

const UNTITLED_TASK = 'Untitled task';

function runState(run: CloudAgentRun): CloudAgentRun['state'] {
  return run.workState ?? run.state;
}

function isTaskRun(run: CloudAgentRun): boolean {
  return run.workMode !== 'chat' && runState(run) !== 'archived';
}

function isFinished(run: CloudAgentRun): boolean {
  return !isLiveTaskState(runState(run));
}

function runTitle(run: CloudAgentRun): string {
  return run.conversationTitle?.trim() || run.conversationPreview?.trim() || UNTITLED_TASK;
}

function runHref(run: CloudAgentRun): string {
  if (run.conversationId) return conversationHref(run.conversationId);
  return `${WORK_HISTORY_ROUTE}?run=${encodeURIComponent(run.id)}`;
}

function clearedMessage(count: number): string {
  return count === 1 ? 'Cleared 1 finished task' : `Cleared ${count} finished tasks`;
}

function failedClearMessage(count: number): string {
  return count === 1
    ? 'Could not clear 1 task. Try again.'
    : `Could not clear ${count} tasks. Try again.`;
}

function failedRestoreMessage(count: number): string {
  return count === 1
    ? 'Could not restore 1 task. Find it under Archived in Tasks.'
    : `Could not restore ${count} tasks. Find them under Archived in Tasks.`;
}

export function HomeActiveTasks() {
  const { t } = useTranslation('v3');
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const client = useMemo(() => createWebCloudTasksClient(), []);
  const [runs, setRuns] = useState<CloudAgentRun[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const page = await client.listRuns({ limit: HOME_ACTIVE_FETCH_LIMIT, signal });
        if (signal?.aborted || !mountedRef.current) return;
        setRuns(page.runs.filter(isTaskRun));
        setLoadFailed(false);
      } catch {
        if (signal?.aborted || !mountedRef.current) return;
        setLoadFailed(true);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, userId]);

  const hasLiveRun = runs?.some((run) => !isFinished(run)) ?? false;

  useEffect(() => {
    if (!hasLiveRun) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, HOME_ACTIVE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasLiveRun, load]);

  const restore = useCallback(
    async (runIds: readonly string[]) => {
      const results = await Promise.allSettled(
        runIds.map((runId) => setWebCloudTaskArchived(runId, false)),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) toast.error(failedRestoreMessage(failed));
      await load();
    },
    [load],
  );

  const finishedRuns = useMemo(() => (runs ?? []).filter(isFinished), [runs]);

  const clearActive = useCallback(async () => {
    if (finishedRuns.length === 0 || clearing) return;
    setClearing(true);
    const results = await Promise.allSettled(
      finishedRuns.map((run) => setWebCloudTaskArchived(run.id, true)),
    );
    if (!mountedRef.current) return;
    const cleared = finishedRuns
      .filter((_, index) => results[index]?.status === 'fulfilled')
      .map((run) => run.id);
    const failed = finishedRuns.length - cleared.length;
    const clearedIds = new Set(cleared);
    setRuns((current) => (current ?? []).filter((run) => !clearedIds.has(run.id)));
    setClearing(false);
    if (cleared.length > 0) {
      toast.success(clearedMessage(cleared.length), {
        action: { label: 'Undo', onClick: () => void restore(cleared) },
      });
    }
    if (failed > 0) toast.error(failedClearMessage(failed));
  }, [clearing, finishedRuns, restore]);

  if (!userId) return null;

  if (loadFailed && !runs) {
    return (
      <section
        aria-label={t('agiWork.home.active')}
        className="mt-6 flex items-center gap-3 px-1 text-sm text-muted-foreground"
        data-testid="home-active-tasks-error"
      >
        <p className="min-w-0 flex-1">Could not load your active tasks.</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3"
          onClick={() => void load()}
        >
          Retry
        </Button>
      </section>
    );
  }

  if (!runs || runs.length === 0) return null;

  const visible = runs.slice(0, HOME_ACTIVE_VISIBLE_LIMIT);
  const now = Date.now();

  return (
    <section
      aria-labelledby="home-active-tasks-heading"
      className="mt-6 w-full"
      data-testid="home-active-tasks"
    >
      <div className="flex min-h-9 items-center gap-3 px-1">
        <h2
          id="home-active-tasks-heading"
          className="min-w-0 flex-1 text-sm font-medium text-muted-foreground"
        >
          {t('agiWork.home.active')}
        </h2>
        {finishedRuns.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-sm text-muted-foreground"
            disabled={clearing}
            aria-busy={clearing || undefined}
            onClick={() => void clearActive()}
          >
            {t('agiWork.home.clearActive')}
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {visible.map((run) => {
          const state = runState(run);
          const live = !isFinished(run);
          const label = taskStateLabel(state);
          return (
            <li key={run.id}>
              <Link
                href={runHref(run)}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
                data-testid={`home-active-task-${run.id}`}
              >
                <span className="relative shrink-0" aria-hidden="true">
                  <ListChecks className="h-[18px] w-[18px] text-muted-foreground" />
                  {live && (
                    <span
                      className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary"
                      data-testid={`home-active-task-live-${run.id}`}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-base text-foreground">
                  {runTitle(run)}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
                <time
                  dateTime={run.updatedAt}
                  className="shrink-0 text-sm tabular-nums text-muted-foreground"
                >
                  {formatListTime(run.updatedAt, now)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>
      {runs.length > HOME_ACTIVE_VISIBLE_LIMIT && (
        <div className="mt-2 flex justify-end px-1">
          <Link
            href={WORK_HISTORY_ROUTE}
            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {WORK_HISTORY_LABEL}
          </Link>
        </div>
      )}
    </section>
  );
}
