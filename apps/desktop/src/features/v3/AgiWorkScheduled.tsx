import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { LifecycleStatus } from '@agiworkforce/types';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { EmptyState } from '@/ui/EmptyState';
import { Spinner } from '@/ui/Spinner';
import { CreateTaskModal } from '../scheduler/CreateTaskModal';
import { cn } from '../../lib/utils';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { invoke } from '../../lib/tauri-mock';
import {
  useSchedulerStore,
  getProblemSummary,
  getScheduleSummary,
  getRelativeTimeDisplay,
  type JobExecutionRecord,
  type ScheduledTask,
} from '../../stores/schedulerStore';
import {
  NOTIFICATION_TARGET_ATTRIBUTE,
  notificationTargetValue,
  useNotificationTarget,
} from '../notifications/notificationTarget';

function IosToggle({
  on,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chat-surface-base)]',
        on ? 'bg-[var(--chat-accent-secondary)]' : 'bg-[var(--chat-border-strong)]',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-[var(--chat-surface-elevated)] shadow transition-transform',
          on ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function isTaskOn(t: ScheduledTask): boolean {
  return t.status === 'active';
}

function nextRunDisplay(t: ScheduledTask): string {
  if (t.status !== 'active') return getRelativeTimeDisplay(t.lastRunAt);
  return getRelativeTimeDisplay(t.nextRunAt);
}

function statusLabel(task: ScheduledTask, t: TFunction): string {
  switch (task.status) {
    case 'active':
      return t('agiWork.scheduled.nextRun');
    case 'failed':
      return t('agiWork.scheduled.stopped', 'Stopped');
    case 'completed':
      return t('agiWork.scheduled.finished', 'Finished');
    default:
      return t('agiWork.scheduled.paused');
  }
}

const BUILT_IN_TASK_LABELS: Record<string, string> = {
  memory_auto_summarization: 'Daily memory summary',
  memory_weekly_decay: 'Weekly memory cleanup',
};

function taskDisplayName(task: ScheduledTask): string {
  return BUILT_IN_TASK_LABELS[task.name] ?? task.name;
}

function KeepAwakeSetting() {
  const { t } = useTranslation('v3');
  const [keepAwake, setKeepAwake] = useState<boolean | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<boolean>('scheduler_get_keep_awake')
      .then((enabled) => {
        if (!cancelled) setKeepAwake(enabled);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = () => {
    const next = !keepAwake;
    setKeepAwake(next);
    setSaveError(null);
    invoke('scheduler_set_keep_awake', { enabled: next }).catch((error: unknown) => {
      setKeepAwake(!next);
      setSaveError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div
      data-testid="scheduled-keep-awake"
      className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--chat-text-primary)]">
            {t('agiWork.scheduled.keepAwakeTitle', 'Keep computer awake')}
          </div>
          <p className="mt-0.5 text-xs text-[var(--chat-text-secondary)]">
            {t(
              'agiWork.scheduled.keepAwakeHint',
              `Scheduled tasks run only while ${PRODUCT_NAMES.desktop} is open. A run missed while the app was closed or the computer slept runs once when the app opens again, if it was due in the last 7 days.`,
            )}
          </p>
        </div>
        {(keepAwake !== null || loadError) && (
          <IosToggle
            on={keepAwake ?? false}
            onToggle={toggle}
            disabled={loadError !== null}
            label={t('agiWork.scheduled.keepAwakeTitle', 'Keep computer awake')}
          />
        )}
      </div>
      {loadError && (
        <p className="mt-2 text-xs text-[var(--chat-text-secondary)]">
          {t('agiWork.scheduled.keepAwakeUnavailable', {
            defaultValue: 'Unavailable: {{reason}}',
            reason: loadError,
          })}
        </p>
      )}
      {saveError && (
        <p role="alert" className="mt-2 text-xs text-[var(--chat-destructive-text)]">
          {saveError}
        </p>
      )}
    </div>
  );
}

const RUNS_SHOWN = 5;

function dueTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ROW_ACTION_CLASS =
  'flex h-8 w-8 items-center justify-center rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]';

function runStatusLabel(run: JobExecutionRecord, t: TFunction): string {
  switch (run.status satisfies LifecycleStatus) {
    case 'completed':
      return t('agiWork.scheduled.runCompleted', 'Ran');
    case 'failed':
      return t('agiWork.scheduled.runFailed', 'Failed');
    case 'cancelled':
      return t('agiWork.scheduled.runSkipped', 'Skipped');
    default:
      return t('agiWork.scheduled.runRunning', 'Running');
  }
}

function RunHistory({ task }: { task: ScheduledTask }) {
  const { t } = useTranslation('v3');
  const getHistory = useSchedulerStore((s) => s.getHistory);
  const [runs, setRuns] = useState<JobExecutionRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHistory(task.id)
      .then((history) => {
        if (cancelled) return;
        setRuns(history.slice(0, RUNS_SHOWN));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(getSimpleErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [getHistory, task.id, task.lastRunAt, task.lastProblem?.reason]);

  if (loadError) {
    return (
      <p role="alert" className="text-xs text-[var(--chat-destructive-text)]">
        {t('agiWork.scheduled.historyUnavailable', {
          defaultValue: 'Run history is unavailable: {{reason}}',
          reason: loadError,
        })}
      </p>
    );
  }
  if (runs === null) {
    return <Spinner size="sm" />;
  }
  if (runs.length === 0) {
    return (
      <p className="text-xs text-[var(--chat-text-secondary)]">
        {t('agiWork.scheduled.noRuns', 'No runs yet.')}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {runs.map((run) => (
        <li key={run.id} className="text-xs text-[var(--chat-text-secondary)]">
          <span className="font-medium text-[var(--chat-text-primary)]">
            {runStatusLabel(run, t)}
          </span>{' '}
          <time dateTime={run.startedAt}>
            {new Date(run.startedAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {run.error && <span className="block break-words">{run.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function ScheduledRow({
  task,
  revealed,
  onEdit,
  onDelete,
}: {
  task: ScheduledTask;
  revealed: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('v3');
  const toggleTask = useSchedulerStore((s) => s.toggleTask);
  const runNow = useSchedulerStore((s) => s.runNow);
  const stopRun = useSchedulerStore((s) => s.stopRun);
  const running = useSchedulerStore((s) => s.runningTaskIds.includes(task.id));
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const name = taskDisplayName(task);
  const problem = getProblemSummary(task);

  useEffect(() => {
    if (revealed) setOpen(true);
  }, [revealed]);

  return (
    <div
      tabIndex={-1}
      {...{ [NOTIFICATION_TARGET_ATTRIBUTE]: notificationTargetValue('schedule', task.id) }}
      className={cn(
        'group rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]',
        revealed && 'ring-2 ring-[var(--chat-accent-primary)]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          (task.status === 'paused' || task.status === 'completed') && 'opacity-60',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={t('agiWork.scheduled.detailsAria', {
            defaultValue: 'Result and runs of scheduled task {{name}}',
            name,
          })}
          onClick={() => setOpen((shown) => !shown)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
        >
          {open ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--chat-text-primary)]">{name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--chat-text-secondary)]">
            <span>{getScheduleSummary(task.schedule)}</span>
          </div>
          {problem && (
            <p
              data-testid="scheduled-task-problem"
              className={cn(
                'mt-1 break-words text-xs',
                task.status === 'failed'
                  ? 'text-[var(--chat-destructive-text)]'
                  : 'text-[var(--chat-text-secondary)]',
              )}
            >
              {problem}
            </p>
          )}
          {task.lastRunWasDueAt !== null && (
            <p
              data-testid="scheduled-task-ran-late"
              className="mt-1 break-words text-xs text-[var(--chat-text-secondary)]"
            >
              {t('agiWork.scheduled.ranLate', {
                defaultValue: 'Its last run was late: it was due {{when}}.',
                when: dueTime(task.lastRunWasDueAt),
              })}
            </p>
          )}
        </div>

        {running ? (
          <>
            <span role="status" className="flex-shrink-0 text-xs text-[var(--chat-text-secondary)]">
              {t('agiWork.scheduled.runRunning', 'Running')}
            </span>
            <button
              type="button"
              onClick={() => void stopRun(task.id).catch(() => undefined)}
              aria-label={t('agiWork.scheduled.stopAria', {
                defaultValue: 'Stop the run of scheduled task {{name}}',
                name,
              })}
              className="flex-shrink-0 rounded-lg border border-[var(--chat-border)] px-2.5 py-1.5 text-sm font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            >
              {t('agiWork.scheduled.stop', 'Stop')}
            </button>
          </>
        ) : (
          <div className="flex flex-shrink-0 flex-col items-end text-xs text-[var(--chat-text-muted)]">
            <span>{statusLabel(task, t)}</span>
            <span className="text-[var(--chat-text-secondary)]">{nextRunDisplay(task)}</span>
          </div>
        )}

        {task.status === 'failed' ? (
          <button
            type="button"
            onClick={() => void toggleTask(task.id)}
            aria-label={t('agiWork.scheduled.turnBackOnAria', {
              defaultValue: 'Turn scheduled task {{name}} back on',
              name,
            })}
            className="flex-shrink-0 rounded-lg border border-[var(--chat-border)] px-2.5 py-1.5 text-sm font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
          >
            {t('agiWork.scheduled.turnBackOn', 'Turn back on')}
          </button>
        ) : (
          <IosToggle
            on={isTaskOn(task)}
            onToggle={() => void toggleTask(task.id)}
            disabled={task.status === 'completed'}
            label={t(
              isTaskOn(task) ? 'agiWork.scheduled.pauseAria' : 'agiWork.scheduled.resumeAria',
              {
                name,
              },
            )}
          />
        )}

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            className={ROW_ACTION_CLASS}
            title={t('agiWork.scheduled.runNowAria', {
              defaultValue: 'Run scheduled task {{name}} now',
              name,
            })}
            aria-label={t('agiWork.scheduled.runNowAria', {
              defaultValue: 'Run scheduled task {{name}} now',
              name,
            })}
            onClick={() => {
              setOpen(true);
              void runNow(task.id).catch(() => undefined);
            }}
          >
            <Play size={12} aria-hidden="true" />
          </button>
          {task.actionType === 'agiTask' && (
            <button
              type="button"
              className={ROW_ACTION_CLASS}
              title={t('agiWork.scheduled.editAria', {
                defaultValue: 'Edit scheduled task {{name}}',
                name,
              })}
              aria-label={t('agiWork.scheduled.editAria', {
                defaultValue: 'Edit scheduled task {{name}}',
                name,
              })}
              onClick={onEdit}
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            title={`${t('common.delete')} ${name}`}
            aria-label={`${t('common.delete')} ${name}`}
            onClick={onDelete}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && (
        <div
          id={detailsId}
          data-testid="scheduled-task-details"
          className="space-y-3 border-t border-[var(--chat-border)] px-4 py-3"
        >
          <section>
            <h2 className="mb-1 text-xs font-medium text-[var(--chat-text-primary)]">
              {t('agiWork.scheduled.lastResult', 'Last result')}
            </h2>
            {task.lastOutput ? (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--chat-surface-hover)] px-3 py-2 text-sm text-[var(--chat-text-primary)]">
                {task.lastOutput}
              </div>
            ) : (
              <p className="text-xs text-[var(--chat-text-secondary)]">
                {t('agiWork.scheduled.noResult', 'No result yet.')}
              </p>
            )}
          </section>
          <section>
            <h2 className="mb-1 text-xs font-medium text-[var(--chat-text-primary)]">
              {t('agiWork.scheduled.recentRuns', 'Recent runs')}
            </h2>
            <RunHistory task={task} />
          </section>
        </div>
      )}
    </div>
  );
}

export function AgiWorkScheduled() {
  const { t } = useTranslation('v3');
  const tasks = useSchedulerStore((s) => s.tasks);
  const isLoading = useSchedulerStore((s) => s.isLoading);
  const error = useSchedulerStore((s) => s.error);
  const fetchTasks = useSchedulerStore((s) => s.fetchTasks);
  const deleteTask = useSchedulerStore((s) => s.deleteTask);
  const initEventListeners = useSchedulerStore((s) => s.initEventListeners);
  const cleanupEventListeners = useSchedulerStore((s) => s.cleanupEventListeners);
  const [deleteCandidate, setDeleteCandidate] = useState<ScheduledTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [listed, setListed] = useState(false);
  const revealedTaskId = useNotificationTarget(
    'schedule',
    tasks.map((task) => task.id),
    listed,
  );

  useEffect(() => {
    let mounted = true;
    void Promise.resolve(fetchTasks()).finally(() => {
      if (mounted) setListed(true);
    });
    initEventListeners().catch(console.error);
    return () => {
      mounted = false;
      cleanupEventListeners();
    };
  }, [fetchTasks, initEventListeners, cleanupEventListeners]);

  return (
    <div
      data-testid="agi-work-scheduled"
      className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]"
    >
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-h2 text-[var(--chat-text-primary)]">
            {t('agiWork.scheduled.title')}
          </h1>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} aria-hidden="true" />
            {t('agiWork.scheduled.scheduleNew')}
          </button>
        </div>

        <KeepAwakeSetting />

        {error && (
          <div
            role="alert"
            data-testid="scheduled-load-error"
            className="flex items-center gap-3 rounded-xl border border-[var(--chat-destructive)] bg-[var(--chat-surface-elevated)] px-4 py-3"
          >
            <AlertTriangle
              size={16}
              aria-hidden="true"
              className="flex-shrink-0 text-[var(--chat-destructive)]"
            />
            <p className="min-w-0 flex-1 text-sm text-[var(--chat-text-primary)]">{error}</p>
            <button
              type="button"
              onClick={() => void fetchTasks()}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-[var(--chat-border)] px-2.5 py-1.5 text-sm font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            >
              <RefreshCw size={13} aria-hidden="true" />
              {t('common.refresh')}
            </button>
          </div>
        )}

        {/* Task list */}
        {isLoading && tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--chat-text-muted)]">
            {t('agiWork.scheduled.loading')}
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <ScheduledRow
                key={task.id}
                task={task}
                revealed={revealedTaskId === task.id}
                onEdit={() => setEditingTask(task)}
                onDelete={() => setDeleteCandidate(task)}
              />
            ))}

            {tasks.length === 0 && !isLoading && !error && (
              <EmptyState
                icon={CalendarClock}
                title={t('agiWork.scheduled.emptyTitle')}
                description={t('agiWork.scheduled.empty')}
                action={{
                  label: t('agiWork.scheduled.scheduleNew'),
                  onClick: () => setCreateOpen(true),
                }}
              />
            )}
          </div>
        )}
      </div>
      <CreateTaskModal
        isOpen={createOpen || editingTask !== null}
        editingTask={editingTask}
        onClose={() => {
          setCreateOpen(false);
          setEditingTask(null);
        }}
      />
      <ConfirmDialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
        title={t('agiWork.scheduled.deleteTitle')}
        description={t('agiWork.scheduled.deleteDescription', {
          name: deleteCandidate ? taskDisplayName(deleteCandidate) : '',
        })}
        confirmText={t('common.delete')}
        variant="destructive"
        onConfirm={() => {
          const taskId = deleteCandidate?.id;
          setDeleteCandidate(null);
          if (taskId) void deleteTask(taskId);
        }}
      />
    </div>
  );
}
