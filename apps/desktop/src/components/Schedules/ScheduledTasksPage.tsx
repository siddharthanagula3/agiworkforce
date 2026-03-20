/**
 * ScheduledTasksPage
 *
 * Full-page view for browsing, creating, editing, and managing scheduled tasks.
 * Equivalent to ChatGPT's "Schedules" settings page — but works with any model
 * via AGI Workforce's event-trigger / cron backend.
 *
 * State is read from schedulerStore (single source of truth).
 * All mutations go through schedulerStore actions which handle Tauri IPC.
 */
import { Calendar, Clock, Edit3, Loader2, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  type ScheduledTask,
  type TaskStatus,
  getRelativeTimeDisplay,
  getScheduleSummary,
  useSchedulerStore,
} from '../../stores/schedulerStore';
import { inferFrequency, type Frequency, type Schedule } from '../../stores/schedulesStore';
import { ScheduleEditor } from './ScheduleEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'active' | 'paused';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
];

const FREQUENCY_BADGE_CLASS: Record<Frequency, string> = {
  daily: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  weekly: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  monthly: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  custom: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a ScheduledTask (from schedulerStore) to the Schedule UI shape. */
function taskToSchedule(task: ScheduledTask): Schedule {
  const cronExpression = task.schedule.cronExpression ?? '';
  const frequency = inferFrequency(cronExpression);
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    cronExpression,
    frequency,
    nextRun: task.nextRunAt,
    lastRun: task.lastRunAt,
    isActive: task.status === 'active',
    createdAt: task.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ScheduleCardProps {
  task: ScheduledTask;
  onEdit: (schedule: Schedule) => void;
}

function ScheduleCard({ task, onEdit }: ScheduleCardProps) {
  const toggleTask = useSchedulerStore((s) => s.toggleTask);
  const deleteTask = useSchedulerStore((s) => s.deleteTask);

  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const schedule = taskToSchedule(task);
  const frequency = schedule.frequency;
  const truncatedName = task.name.length > 60 ? task.name.slice(0, 57) + '…' : task.name;
  const truncatedPrompt = task.prompt.length > 100 ? task.prompt.slice(0, 97) + '…' : task.prompt;

  const handleToggle = useCallback(async () => {
    setIsToggling(true);
    try {
      await toggleTask(task.id);
      const label = task.status === 'active' ? 'paused' : 'resumed';
      toast.success(`Schedule ${label}`);
    } catch {
      toast.error('Failed to update schedule');
    } finally {
      setIsToggling(false);
    }
  }, [toggleTask, task.id, task.status]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success(`"${task.name}" deleted`);
    } catch {
      toast.error('Failed to delete schedule');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTask, task.id, task.name]);

  const isActive = task.status === 'active';

  return (
    <div
      className={cn(
        'group rounded-xl border bg-white/[0.03] p-4 transition',
        isActive
          ? 'border-white/8 hover:border-white/15'
          : 'border-white/5 opacity-70 hover:opacity-90',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: info */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Name + frequency badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white" title={task.name}>
              {truncatedName}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                FREQUENCY_BADGE_CLASS[frequency],
              )}
            >
              {FREQUENCY_LABEL[frequency]}
            </span>
          </div>

          {/* Prompt */}
          <p className="text-xs leading-relaxed text-slate-500" title={task.prompt}>
            {truncatedPrompt}
          </p>

          {/* Time metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {getScheduleSummary(task.schedule)}
            </span>
            {task.nextRunAt !== null && isActive && (
              <span className="text-teal-500">Next: {getRelativeTimeDisplay(task.nextRunAt)}</span>
            )}
            {task.lastRunAt !== null && <span>Last: {getRelativeTimeDisplay(task.lastRunAt)}</span>}
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Toggle active/paused */}
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={isToggling || isDeleting}
            title={isActive ? 'Pause schedule' : 'Resume schedule'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
              isActive
                ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                : 'border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20',
              (isToggling || isDeleting) && 'cursor-not-allowed opacity-50',
            )}
          >
            {isToggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isActive ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">{isActive ? 'Pause' : 'Resume'}</span>
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(schedule)}
            disabled={isDeleting}
            title="Edit schedule"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isToggling}
            title="Delete schedule"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-900/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  filter: FilterTab;
  onCreate: () => void;
}

function EmptyState({ filter, onCreate }: EmptyStateProps) {
  if (filter !== 'all') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-slate-500">No {filter} schedules.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10">
        <Calendar className="h-7 w-7 text-teal-400" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-white">No scheduled tasks yet</h3>
      <p className="mb-6 max-w-sm text-sm text-slate-500">
        Create one to automate recurring work — like ChatGPT Tasks, but for any AI model.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500"
      >
        <Plus className="h-4 w-4" />
        Create your first schedule
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ScheduledTasksPage() {
  const tasks = useSchedulerStore((s) => s.tasks);
  const isLoading = useSchedulerStore((s) => s.isLoading);
  const fetchTasks = useSchedulerStore((s) => s.fetchTasks);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    const statusMap: Record<FilterTab, TaskStatus | null> = {
      all: null,
      active: 'active',
      paused: 'paused',
    };
    const target = statusMap[filter];
    return target ? tasks.filter((t) => t.status === target) : tasks;
  }, [tasks, filter]);

  const tabCounts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => t.status === 'active').length,
      paused: tasks.filter((t) => t.status === 'paused').length,
    }),
    [tasks],
  );

  const handleOpenCreate = useCallback(() => {
    setEditingSchedule(null);
    setIsEditorOpen(true);
  }, []);

  const handleEdit = useCallback((schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
    setEditingSchedule(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-400" />
              <h1 className="text-lg font-semibold text-white">Scheduled Tasks</h1>
              {tasks.length > 0 && (
                <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-300">
                  {tasks.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Automate recurring AI tasks — runs on any model, no supervision needed.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            New Schedule
          </button>
        </div>

        {/* Filter tabs */}
        {tasks.length > 0 && (
          <div className="mt-4 flex gap-1 border-b border-transparent">
            {FILTER_TABS.map((tab) => {
              const count = tabCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                    filter === tab.id
                      ? 'bg-teal-500/15 text-teal-300'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                        filter === tab.id
                          ? 'bg-teal-500/20 text-teal-300'
                          : 'bg-white/5 text-slate-500',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading schedules…
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState filter={filter} onCreate={handleOpenCreate} />
        ) : filteredTasks.length === 0 ? (
          <EmptyState filter={filter} onCreate={handleOpenCreate} />
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <ScheduleCard key={task.id} task={task} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      {/* Editor dialog */}
      <ScheduleEditor
        isOpen={isEditorOpen}
        editingSchedule={editingSchedule}
        onClose={handleCloseEditor}
      />
    </div>
  );
}
