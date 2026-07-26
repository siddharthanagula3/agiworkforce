import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { cn } from '../../lib/utils';
import {
  useSchedulerStore,
  getScheduleSummary,
  getRelativeTimeDisplay,
  type ScheduledTask,
} from '../../stores/schedulerStore';

function IosToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
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

const BUILT_IN_TASK_LABELS: Record<string, string> = {
  memory_auto_summarization: 'Daily memory summary',
  memory_weekly_decay: 'Weekly memory cleanup',
};

function taskDisplayName(task: ScheduledTask): string {
  return BUILT_IN_TASK_LABELS[task.name] ?? task.name;
}

export function AgiWorkScheduled() {
  const { t } = useTranslation('v3');
  const tasks = useSchedulerStore((s) => s.tasks);
  const isLoading = useSchedulerStore((s) => s.isLoading);
  const fetchTasks = useSchedulerStore((s) => s.fetchTasks);
  const toggleTask = useSchedulerStore((s) => s.toggleTask);
  const deleteTask = useSchedulerStore((s) => s.deleteTask);
  const [deleteCandidate, setDeleteCandidate] = useState<ScheduledTask | null>(null);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl font-medium text-[var(--chat-text-primary)]">
            {t('agiWork.scheduled.title')}
          </h1>
        </div>

        {/* Task list */}
        {isLoading && tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--chat-text-muted)]">
            {t('agiWork.scheduled.loading')}
          </div>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3',
                  !isTaskOn(task) && 'opacity-60',
                )}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]">
                  <RefreshCw size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--chat-text-primary)]">
                    {taskDisplayName(task)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--chat-text-secondary)]">
                    <span>{getScheduleSummary(task.schedule)}</span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-col items-end text-xs text-[var(--chat-text-muted)]">
                  <span>
                    {isTaskOn(task)
                      ? t('agiWork.scheduled.nextRun')
                      : t('agiWork.scheduled.paused')}
                  </span>
                  <span className="text-[var(--chat-text-secondary)]">{nextRunDisplay(task)}</span>
                </div>

                <IosToggle
                  on={isTaskOn(task)}
                  onToggle={() => void toggleTask(task.id)}
                  label={t(
                    isTaskOn(task) ? 'agiWork.scheduled.pauseAria' : 'agiWork.scheduled.resumeAria',
                    { name: taskDisplayName(task) },
                  )}
                />

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
                    title={`${t('common.delete')} ${taskDisplayName(task)}`}
                    aria-label={`${t('common.delete')} ${taskDisplayName(task)}`}
                    onClick={() => setDeleteCandidate(task)}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

            {tasks.length === 0 && !isLoading && (
              <div className="rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-text-muted)]">
                {t('agiWork.scheduled.empty')}
              </div>
            )}
          </div>
        )}
      </div>
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
