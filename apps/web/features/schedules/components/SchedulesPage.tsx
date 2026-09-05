'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { toUserMessageWithStatus } from '@agiworkforce/unified-chat';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@agiworkforce/ui';
import { CalendarClock, Loader2, MessageSquarePlus, Plus, RotateCcw } from 'lucide-react';
import { ScheduleCard, type ScheduleOperation } from './ScheduleCard';
import { ScheduleForm } from './ScheduleForm';
import { SCHEDULE_TEMPLATES, type ScheduleTemplate } from '../lib/schedule-templates';
import type { ScheduleHistoryState } from './ScheduleRunHistory';
import {
  createInitialScheduleDraft,
  scheduleToDraft,
  validateAndBuildScheduleRequest,
} from '../lib/schedule-form';
import { scheduleApi, type ScheduleApi } from '../services/schedule-api';
import {
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
} from '@agiworkforce/cloud-contracts';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { toUserMessage } from '@/lib/user-error-message';
import {
  formatDateTime,
  scheduleResultText,
  type ScheduleDraft,
  type ScheduleFormErrors,
  type ScheduleRun,
  type ScheduleTask,
} from '../types';

/**
 * Kept as prose in the create dialog, where someone is about to rely on an
 * unattended run, rather than as a maturity chip in the header. The warning is
 * the load-bearing half; the alpha framing was branding.
 */
export const SCHEDULE_RELIABILITY_NOTE =
  'An unattended run can fail or be skipped, and behaviour may change.';

const SCHEDULE_PAGE_SIZE = MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE;
const RUN_PAGE_SIZE = MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE;

type ScheduleStatusFilter = 'all' | ScheduleTask['status'];

const STATUS_FILTERS: Array<{ id: ScheduleStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'expired', label: 'Expired' },
];

/**
 * How often to re-check whether a "due" schedule is actually mid-run.
 *
 * There is no push channel and no schedule-level 'running' status (the
 * enum only has active/paused/completed/failed/expired, see
 * ManagedCloudScheduleTaskSchema), so this polls the one signal that does
 * carry it: the schedule's own run history.
 */
const RUNNING_POLL_INTERVAL_MS = 6_000;

/**
 * How long a schedule stays a polling candidate after its `nextExecutionAt`
 * passes. Bounds the cost of `RUNNING_POLL_INTERVAL_MS` polling to schedules
 * that could plausibly be executing right now, instead of re-checking every
 * enabled schedule on the page every tick, `nextExecutionAt` does not
 * change again until the next full schedule-list refresh, so without this
 * bound a stale due time would poll forever.
 */
const RUNNING_DUE_WINDOW_MS = 2 * 60_000;

const EMPTY_HISTORY: ScheduleHistoryState = {
  status: 'idle',
  runs: [],
  error: null,
  hasMore: false,
  nextOffset: 0,
  loadingMore: false,
};

export interface ScheduleProjectOption {
  id: string;
  name: string;
}

export interface ScheduleProjectScope {
  projectId: string;
  projectName: string;
}

interface SchedulesPageProps {
  api?: ScheduleApi;
  now?: () => Date;
  createIdempotencyKey?: () => string;
  scope?: ScheduleProjectScope | null;
  projects?: ScheduleProjectOption[];
  /**
   * Starts a chat about a schedule's latest result. Injected rather than
   * called from a `useRouter()` here, the same reason `api` and `now` are
   * props: this component is rendered from both the standalone schedules
   * route and the project-detail page, and unit-tested with neither.
   */
  onOpenChat?: (schedule: ScheduleTask) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return toUserMessageWithStatus(error, fallback);
}

function uniqueSchedules(current: ScheduleTask[], incoming: ScheduleTask[]): ScheduleTask[] {
  const byId = new Map(current.map((schedule) => [schedule.id, schedule]));
  for (const schedule of incoming) byId.set(schedule.id, schedule);
  return [...byId.values()];
}

function uniqueRuns(current: ScheduleRun[], incoming: ScheduleRun[]): ScheduleRun[] {
  const byId = new Map(current.map((run) => [run.id, run]));
  for (const run of incoming) byId.set(run.id, run);
  return [...byId.values()].sort(
    (left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export function SchedulesPage({
  api = scheduleApi,
  now = () => new Date(),
  createIdempotencyKey = defaultIdempotencyKey,
  scope = null,
  projects = [],
  onOpenChat,
}: SchedulesPageProps) {
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  const [listStatus, setListStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [hasMoreSchedules, setHasMoreSchedules] = useState(false);
  const [nextScheduleOffset, setNextScheduleOffset] = useState(0);
  const [loadingMoreSchedules, setLoadingMoreSchedules] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleTask | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(() => createInitialScheduleDraft());
  const initialDraftRef = useRef('');
  const [formErrors, setFormErrors] = useState<ScheduleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const [operations, setOperations] = useState<Record<string, ScheduleOperation>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, ScheduleHistoryState>>({});
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const manualRunKeys = useRef<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');
  const [runningScheduleIds, setRunningScheduleIds] = useState<Set<string>>(new Set());

  const { openSettings } = useSettingsModal();
  const [resultTarget, setResultTarget] = useState<ScheduleTask | null>(null);
  const [resultRun, setResultRun] = useState<ScheduleRun | null>(null);
  const [resultStatus, setResultStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [resultError, setResultError] = useState<string | null>(null);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const draftDirty = dialogOpen && JSON.stringify(draft) !== initialDraftRef.current;

  const loadSchedules = useCallback(
    async (options: { append?: boolean; offset?: number; signal?: AbortSignal } = {}) => {
      const append = options.append ?? false;
      setListError(null);
      if (append) setLoadingMoreSchedules(true);
      else {
        setListStatus('loading');
      }
      const offset = append ? (options.offset ?? 0) : 0;
      try {
        const result = await api.listSchedules({
          limit: SCHEDULE_PAGE_SIZE,
          offset,
          projectId: scope?.projectId,
          signal: options.signal,
        });
        setSchedules((current) =>
          append ? uniqueSchedules(current, result.schedules) : result.schedules,
        );
        setHasMoreSchedules(result.hasMore);
        setNextScheduleOffset(result.pagination.offset + result.pagination.limit);
        setListStatus('success');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!append) {
          setListStatus('error');
          setListError(errorMessage(error, 'Schedules could not be loaded.'));
        } else {
          setListError(errorMessage(error, 'More schedules could not be loaded.'));
        }
      } finally {
        if (append) setLoadingMoreSchedules(false);
      }
    },
    [api, scope?.projectId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedules({ signal: controller.signal });
    return () => controller.abort();
  }, [loadSchedules]);

  useEffect(() => {
    if (!draftDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftDirty]);

  // Transient "running now" indicator for schedule rows (sched-gap-07). Only
  // schedules whose next execution is due, recently passed and still inside
  // RUNNING_DUE_WINDOW_MS, are checked, so an idle list with nothing due
  // issues no requests at all.
  useEffect(() => {
    const computeDueSchedules = () => {
      const now = Date.now();
      return schedules.filter((schedule) => {
        if (!schedule.isEnabled || schedule.status !== 'active' || !schedule.nextExecutionAt) {
          return false;
        }
        const dueAt = new Date(schedule.nextExecutionAt).getTime();
        return Number.isFinite(dueAt) && dueAt <= now && now - dueAt <= RUNNING_DUE_WINDOW_MS;
      });
    };

    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      const due = computeDueSchedules();
      if (due.length === 0) {
        setRunningScheduleIds((current) => (current.size === 0 ? current : new Set()));
        return;
      }
      const results = await Promise.allSettled(
        due.map((schedule) =>
          api.listRuns(schedule.id, { limit: 1, offset: 0, signal: controller.signal }),
        ),
      );
      if (cancelled) return;
      const next = new Set<string>();
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.runs[0]?.status === 'running') {
          next.add(due[index]!.id);
        }
      });
      setRunningScheduleIds(next);
    };

    void poll();
    const timer = setInterval(() => void poll(), RUNNING_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [schedules, api]);

  const setOperation = (scheduleId: string, operation: ScheduleOperation) => {
    setOperations((current) => ({ ...current, [scheduleId]: operation }));
  };
  const setRowError = (scheduleId: string, message: string | null) => {
    setRowErrors((current) => ({ ...current, [scheduleId]: message }));
  };
  const replaceSchedule = (next: ScheduleTask) => {
    setSchedules((current) =>
      current.map((schedule) => (schedule.id === next.id ? next : schedule)),
    );
  };

  const openCreateFromTemplate = (template: ScheduleTemplate) => {
    // Templates seed the draft and nothing else: no schedule exists until the
    // user submits the dialog, so a mis-tapped card costs a dismissal.
    const nextDraft = {
      ...createInitialScheduleDraft(),
      ...template.draft,
      projectId: scope?.projectId ?? null,
    };
    setEditing(null);
    setDraft(nextDraft);
    initialDraftRef.current = JSON.stringify(nextDraft);
    setFormErrors({});
    setSubmitError(null);
    setDialogOpen(true);
  };

  const openCreate = () => {
    const nextDraft = { ...createInitialScheduleDraft(), projectId: scope?.projectId ?? null };
    setEditing(null);
    setDraft(nextDraft);
    initialDraftRef.current = JSON.stringify(nextDraft);
    setFormErrors({});
    setSubmitError(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule: ScheduleTask) => {
    const nextDraft = scheduleToDraft(schedule);
    setEditing(schedule);
    setDraft(nextDraft);
    initialDraftRef.current = JSON.stringify(nextDraft);
    setFormErrors({});
    setSubmitError(null);
    setDialogOpen(true);
  };

  const closeEditor = (force = false) => {
    if (saving) return;
    if (!force && draftDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    setDialogOpen(false);
    setEditing(null);
    setFormErrors({});
    setSubmitError(null);
  };

  const confirmDiscard = () => {
    setDiscardConfirmOpen(false);
    closeEditor(true);
  };

  const saveSchedule = async () => {
    const validation = validateAndBuildScheduleRequest(draft, now(), {
      existingIntervalMs: editing?.intervalMs,
    });
    if (!validation.ok) {
      setFormErrors(validation.errors);
      setSubmitError(null);
      return;
    }
    setFormErrors({});
    setSubmitError(null);
    setSaving(true);
    try {
      const saved = editing
        ? await api.updateSchedule(editing.id, validation.payload)
        : await api.createSchedule(validation.payload);
      setSchedules((current) =>
        editing
          ? current.map((schedule) => (schedule.id === saved.id ? saved : schedule))
          : [saved, ...current],
      );
      setActionMessage(editing ? 'Schedule updated.' : 'Schedule created.');
      initialDraftRef.current = JSON.stringify(draft);
      setDialogOpen(false);
      setEditing(null);
    } catch (error) {
      setSubmitError(errorMessage(error, 'Schedule could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (schedule: ScheduleTask) => {
    setOperation(schedule.id, 'toggle');
    setRowError(schedule.id, null);
    try {
      const updated = await api.setScheduleEnabled(schedule.id, !schedule.isEnabled);
      replaceSchedule(updated);
      setActionMessage(updated.isEnabled ? 'Schedule resumed.' : 'Schedule paused.');
    } catch (error) {
      setRowError(schedule.id, errorMessage(error, 'Schedule status could not be changed.'));
    } finally {
      setOperation(schedule.id, null);
    }
  };

  const loadHistory = async (schedule: ScheduleTask, append = false) => {
    const current = historyById[schedule.id] ?? EMPTY_HISTORY;
    setHistoryById((all) => ({
      ...all,
      [schedule.id]: {
        ...current,
        status: append ? current.status : 'loading',
        loadingMore: append,
        error: null,
      },
    }));
    try {
      const result = await api.listRuns(schedule.id, {
        limit: RUN_PAGE_SIZE,
        offset: append ? current.nextOffset : 0,
      });
      setHistoryById((all) => ({
        ...all,
        [schedule.id]: {
          status: 'success',
          runs: append ? uniqueRuns(current.runs, result.runs) : result.runs,
          error: null,
          hasMore: result.hasMore,
          nextOffset: result.pagination.offset + result.pagination.limit,
          loadingMore: false,
        },
      }));
    } catch (error) {
      setHistoryById((all) => ({
        ...all,
        [schedule.id]: {
          ...current,
          status: append ? current.status : 'error',
          error: errorMessage(error, 'Run history could not be loaded.'),
          loadingMore: false,
        },
      }));
    }
  };

  const toggleHistory = (schedule: ScheduleTask) => {
    if (expandedHistoryId === schedule.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(schedule.id);
    const current = historyById[schedule.id];
    if (!current || current.status === 'idle') void loadHistory(schedule);
  };

  const runNow = async (schedule: ScheduleTask) => {
    setOperation(schedule.id, 'run');
    setRowError(schedule.id, null);
    const key = manualRunKeys.current[schedule.id] ?? createIdempotencyKey();
    manualRunKeys.current[schedule.id] = key;
    try {
      const result = await api.runNow(schedule.id, key);
      delete manualRunKeys.current[schedule.id];
      setHistoryById((all) => {
        const current = all[schedule.id] ?? EMPTY_HISTORY;
        return {
          ...all,
          [schedule.id]: {
            ...current,
            status: 'success',
            runs: uniqueRuns(current.runs, [result.run]),
          },
        };
      });
      try {
        replaceSchedule(await api.getSchedule(schedule.id));
      } catch {
        setRowError(
          schedule.id,
          'The run finished, but the schedule summary could not be refreshed.',
        );
      }
      setActionMessage(
        result.run.status === 'success'
          ? 'Schedule finished successfully.'
          : `Schedule finished with status ${result.run.status}.`,
      );
    } catch (error) {
      setRowError(schedule.id, errorMessage(error, 'Schedule could not be run.'));
    } finally {
      setOperation(schedule.id, null);
    }
  };

  const deleteSchedule = async () => {
    const target = deleteTarget;
    if (!target) return;
    setOperation(target.id, 'delete');
    setRowError(target.id, null);
    try {
      await api.deleteSchedule(target.id);
      setSchedules((current) => current.filter((schedule) => schedule.id !== target.id));
      setHistoryById((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
      if (expandedHistoryId === target.id) setExpandedHistoryId(null);
      setDeleteTarget(null);
      setActionMessage('Schedule deleted.');
    } catch (error) {
      setRowError(target.id, errorMessage(error, 'Schedule could not be deleted.'));
      setDeleteTarget(null);
    } finally {
      setOperation(target.id, null);
    }
  };

  const shareSchedule = useCallback(
    async (schedule: ScheduleTask) => {
      // No schedule-sharing endpoint exists; this copies the same app link
      // anyone with access to the account can already reach.
      const path = scope ? `/chat/projects/${scope.projectId}` : '/chat/schedules';
      const url = `${window.location.origin}${path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`Link to ${schedule.name} copied`);
      } catch (error) {
        toast.error(toUserMessage(error, 'Could not copy the link'));
      }
    },
    [scope],
  );

  const openNotificationSettings = useCallback(() => {
    openSettings('notifications');
  }, [openSettings]);

  const openResultPanel = useCallback(
    async (schedule: ScheduleTask) => {
      setResultTarget(schedule);
      setResultRun(null);
      setResultError(null);
      setResultStatus('loading');
      try {
        const result = await api.listRuns(schedule.id, { limit: 1, offset: 0 });
        setResultRun(result.runs[0] ?? null);
        setResultStatus('success');
      } catch (error) {
        setResultStatus('error');
        setResultError(errorMessage(error, 'The latest result could not be loaded.'));
      }
    },
    [api],
  );

  const openChatAboutSchedule = useCallback(
    (schedule: ScheduleTask) => {
      if (onOpenChat) {
        onOpenChat(schedule);
        return;
      }
      const target = `/chat?starterPrompt=${encodeURIComponent(schedule.prompt ?? schedule.name)}`;
      if (typeof window !== 'undefined') window.location.assign(target);
    },
    [onOpenChat],
  );

  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((left, right) => {
        if (left.isEnabled !== right.isEnabled) return left.isEnabled ? -1 : 1;
        const leftNext = left.nextExecutionAt ? new Date(left.nextExecutionAt).getTime() : Infinity;
        const rightNext = right.nextExecutionAt
          ? new Date(right.nextExecutionAt).getTime()
          : Infinity;
        return leftNext - rightNext || right.createdAt.localeCompare(left.createdAt);
      }),
    [schedules],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<ScheduleStatusFilter, number> = {
      all: sortedSchedules.length,
      active: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      expired: 0,
    };
    for (const schedule of sortedSchedules) counts[schedule.status] += 1;
    return counts;
  }, [sortedSchedules]);

  const projectFilters = useMemo(() => {
    if (scope) return [];
    const seen = new Set<string>();
    const filters: Array<{ id: string; label: string }> = [];
    for (const schedule of sortedSchedules) {
      const projectId = schedule.projectId;
      if (!projectId || seen.has(projectId)) continue;
      seen.add(projectId);
      filters.push({ id: projectId, label: projectNameById.get(projectId) ?? 'Unknown project' });
    }
    return filters;
  }, [sortedSchedules, scope, projectNameById]);

  const filteredSchedules = useMemo(
    () =>
      sortedSchedules
        .filter((schedule) => statusFilter === 'all' || schedule.status === statusFilter)
        .filter((schedule) => projectFilter === 'all' || schedule.projectId === projectFilter),
    [sortedSchedules, statusFilter, projectFilter],
  );

  const statusFilterLabel =
    STATUS_FILTERS.find((filter) => filter.id === statusFilter)?.label ?? 'All';
  const projectFilterLabel =
    projectFilter === 'all'
      ? 'All'
      : (projectFilters.find((filter) => filter.id === projectFilter)?.label ?? 'All');

  const Root = scope ? 'section' : 'main';

  return (
    <Root className={scope ? undefined : 'min-h-full bg-background text-foreground'}>
      <div
        className={
          scope
            ? 'flex w-full flex-col gap-6'
            : 'mx-auto flex w-full max-w-[68rem] flex-col gap-8 px-8 py-12'
        }
      >
        <header
          className={
            scope
              ? 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
              : 'flex flex-col gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end sm:justify-between'
          }
        >
          {scope ? (
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-foreground">Scheduled</h2>
              <p className="text-sm text-muted-foreground">
                Recurring tasks that run with {scope.projectName}&rsquo;s instructions and files in
                scope.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl space-y-1">
              <h1 className="text-balance font-[var(--chat-font-sans)] text-[28px] font-medium">
                Schedules
              </h1>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                Run a task once at a future time or on a recurring schedule.
              </p>
            </div>
          )}
          <Button type="button" onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {scope ? 'New task in this project' : 'Create Schedule'}
          </Button>
        </header>

        <div
          role="status"
          aria-label="Schedule action result"
          aria-live="polite"
          className={actionMessage ? 'text-sm text-emerald-700 dark:text-emerald-300' : 'sr-only'}
        >
          {actionMessage || 'No schedule action completed.'}
        </div>

        {listStatus === 'loading' && (
          <section role="status" aria-label="Loading schedules" className="space-y-4">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-52 w-full rounded-2xl" />
            ))}
            <span className="sr-only">Loading schedules…</span>
          </section>
        )}

        {listStatus === 'error' && (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <p role="alert" className="text-sm text-danger">
              {listError ?? 'Schedules could not be loaded.'} Check your connection, then retry.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void loadSchedules()}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry Loading Schedules
            </Button>
          </section>
        )}

        {listStatus === 'success' && sortedSchedules.length === 0 && (
          <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <CalendarClock className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">
              {scope ? 'No scheduled tasks in this project yet' : 'No schedules yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Create a self-contained Managed Cloud text task and choose exactly when it can run.
            </p>
            <Button type="button" className="mt-5" onClick={openCreate}>
              {scope ? 'Create Your First Scheduled Task' : 'Create Your First Schedule'}
            </Button>

            {/*
              Starting from a blank prompt is the reason most people never make
              a second schedule. Each card opens the SAME create dialog with the
              draft pre-filled, so it is a starting point the user still reviews
              and edits, never a schedule created behind their back.
            */}
            <div className="mt-10 text-left">
              <h3 className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Or start from one of these
              </h3>
              <ul className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SCHEDULE_TEMPLATES.map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => openCreateFromTemplate(template)}
                      className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40"
                    >
                      <span className="text-sm font-medium text-foreground">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                      <span className="mt-1 text-[12px] text-muted-foreground">
                        {template.cadenceLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {listStatus === 'success' && sortedSchedules.length > 0 && (
          <div
            role="group"
            aria-label="Filter schedules by status"
            className="flex flex-wrap items-center gap-2"
          >
            {STATUS_FILTERS.map((filter) => {
              const count = statusCounts[filter.id];
              if (filter.id !== 'all' && count === 0) return null;
              const selected = statusFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStatusFilter(filter.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {filter.label} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {listStatus === 'success' && projectFilters.length > 0 && (
          <div
            role="group"
            aria-label="Filter schedules by project"
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              aria-pressed={projectFilter === 'all'}
              onClick={() => setProjectFilter('all')}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                projectFilter === 'all'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              All Projects
            </button>
            {projectFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={projectFilter === filter.id}
                onClick={() => setProjectFilter(filter.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  projectFilter === filter.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {listStatus === 'success' && sortedSchedules.length > 0 && (
          <section aria-label="Your Schedules" className="space-y-4">
            {listError && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-danger">
                {listError} Retry loading more schedules.
              </p>
            )}
            {filteredSchedules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No {statusFilter === 'all' ? '' : `${statusFilterLabel.toLowerCase()} `}
                  schedules{projectFilter === 'all' ? '' : ` in ${projectFilterLabel}`}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setStatusFilter('all');
                    setProjectFilter('all');
                  }}
                >
                  Show All Schedules
                </Button>
              </div>
            ) : (
              filteredSchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  projectName={
                    scope || !schedule.projectId
                      ? null
                      : (projectNameById.get(schedule.projectId) ?? null)
                  }
                  schedule={schedule}
                  operation={operations[schedule.id] ?? null}
                  error={rowErrors[schedule.id] ?? null}
                  isRunningNow={
                    operations[schedule.id] === 'run' || runningScheduleIds.has(schedule.id)
                  }
                  historyExpanded={expandedHistoryId === schedule.id}
                  history={historyById[schedule.id] ?? EMPTY_HISTORY}
                  onToggleEnabled={(selected) => void toggleEnabled(selected)}
                  onRunNow={(selected) => void runNow(selected)}
                  onEdit={openEdit}
                  onShare={(selected) => void shareSchedule(selected)}
                  onOpenNotificationSettings={openNotificationSettings}
                  onViewResult={(selected) => void openResultPanel(selected)}
                  onDelete={setDeleteTarget}
                  onToggleHistory={toggleHistory}
                  onRetryHistory={(selected) => void loadHistory(selected)}
                  onLoadMoreHistory={(selected) => void loadHistory(selected, true)}
                />
              ))
            )}
            {hasMoreSchedules && filteredSchedules.length > 0 && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadSchedules({ append: true, offset: nextScheduleOffset })}
                  disabled={loadingMoreSchedules}
                  aria-busy={loadingMoreSchedules}
                >
                  {loadingMoreSchedules && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                  {loadingMoreSchedules
                    ? 'Loading More…'
                    : listError
                      ? 'Retry Loading More Schedules'
                      : 'Load More Schedules'}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          className="flex h-[min(92dvh,54rem)] max-h-[calc(100dvh-1rem)] flex-col sm:max-w-2xl"
          closeLabel="Close schedule editor"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle>
            <DialogDescription>
              Configure a text-only Managed Cloud task. The server validates timing again before
              saving. {SCHEDULE_RELIABILITY_NOTE}
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm
            draft={draft}
            errors={formErrors}
            submitError={submitError}
            saving={saving}
            isEdit={Boolean(editing)}
            onChange={(patch) => {
              setDraft((current) => ({ ...current, ...patch }));
              setFormErrors((current) => {
                const next = { ...current };
                for (const field of Object.keys(patch) as (keyof ScheduleDraft)[])
                  delete next[field];
                return next;
              });
              setSubmitError(null);
            }}
            onSubmit={() => void saveSchedule()}
            onCancel={() => closeEditor()}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && deleteTarget && operations[deleteTarget.id] !== 'delete')
            setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete “{deleteTarget?.name}” and its run history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={Boolean(deleteTarget && operations[deleteTarget.id] === 'delete')}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(deleteTarget && operations[deleteTarget.id] === 'delete')}
              onClick={(event) => {
                event.preventDefault();
                void deleteSchedule();
              }}
            >
              {deleteTarget && operations[deleteTarget.id] === 'delete'
                ? 'Deleting…'
                : 'Delete Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Unsaved Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your schedule edits have not been saved. Closing the editor now discards them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirmDiscard();
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={resultTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResultTarget(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{resultTarget?.name}</SheetTitle>
            <SheetDescription>Latest result</SheetDescription>
          </SheetHeader>

          {resultStatus === 'loading' && (
            <div role="status" className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {resultStatus === 'error' && (
            <div>
              <p role="alert" className="text-sm text-danger">
                {resultError}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => resultTarget && void openResultPanel(resultTarget)}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          )}

          {resultStatus === 'success' &&
            (resultRun ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(resultRun.startedAt, resultTarget?.timezone)} · {resultRun.status}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {scheduleResultText(resultRun) ?? resultRun.error ?? 'No output was recorded.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">This schedule has not run yet.</p>
            ))}

          {resultTarget && (
            <Button
              type="button"
              className="mt-auto"
              onClick={() => openChatAboutSchedule(resultTarget)}
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Open chat
            </Button>
          )}
        </SheetContent>
      </Sheet>
    </Root>
  );
}

export default SchedulesPage;
