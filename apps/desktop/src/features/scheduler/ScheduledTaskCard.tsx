import {
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  type ScheduledTask,
  type TaskStatus,
  getRelativeTimeDisplay,
  getScheduleSummary,
  useSchedulerStore,
} from '../../stores/schedulerStore';
import { cn } from '../../lib/utils';

interface ScheduledTaskCardProps {
  task: ScheduledTask;
  onEdit: (task: ScheduledTask) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; badgeClass: string; dotClass: string }> = {
  active: {
    label: 'Active',
    badgeClass: 'bg-green-500/15 text-green-400 border-green-500/25',
    dotClass: 'bg-green-400',
  },
  paused: {
    label: 'Paused',
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    dotClass: 'bg-yellow-400',
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
    dotClass: 'bg-slate-400',
  },
  failed: {
    label: 'Failed',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/25',
    dotClass: 'bg-red-400',
  },
};

export function ScheduledTaskCard({ task, onEdit }: ScheduledTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteTask = useSchedulerStore((s) => s.deleteTask);
  const toggleTask = useSchedulerStore((s) => s.toggleTask);
  const runNow = useSchedulerStore((s) => s.runNow);

  const statusCfg = STATUS_CONFIG[task.status];
  const truncatedName = task.name.length > 50 ? task.name.slice(0, 47) + '...' : task.name;

  const handleRunNow = useCallback(async () => {
    setIsRunning(true);
    try {
      await runNow(task.id);
      toast.success(`Task "${task.name}" triggered`);
    } catch {
      toast.error('Failed to run task');
    } finally {
      setIsRunning(false);
    }
  }, [runNow, task.id, task.name]);

  const handleToggle = useCallback(async () => {
    setIsToggling(true);
    try {
      await toggleTask(task.id);
      const label = task.status === 'active' ? 'paused' : 'resumed';
      toast.success(`Task ${label}`);
    } catch {
      toast.error('Failed to update task');
    } finally {
      setIsToggling(false);
    }
  }, [toggleTask, task.id, task.status]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success(`Task "${task.name}" deleted`);
    } catch {
      toast.error('Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTask, task.id, task.name]);

  const canToggle = task.status === 'active' || task.status === 'paused';

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] transition hover:border-white/15">
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-0.5 flex-shrink-0 text-slate-500 transition hover:text-slate-300"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          {/* Name + status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white" title={task.name}>
              {truncatedName}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                statusCfg.badgeClass,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dotClass)} />
              {statusCfg.label}
            </span>
          </div>

          {/* Schedule summary */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              {getScheduleSummary(task.schedule)}
            </span>
            {task.lastRunAt !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last: {getRelativeTimeDisplay(task.lastRunAt)}
              </span>
            )}
            {task.nextRunAt !== null && task.status === 'active' && (
              <span className="text-teal-500">Next: {getRelativeTimeDisplay(task.nextRunAt)}</span>
            )}
            {task.runCount > 0 && <span>{task.runCount}x run</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={isRunning}
            title="Run now"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>

          {canToggle && (
            <button
              type="button"
              onClick={() => void handleToggle()}
              disabled={isToggling}
              title={task.status === 'active' ? 'Pause task' : 'Resume task'}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isToggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : task.status === 'active' ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 text-teal-400" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Edit task"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
            title="Delete task"
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

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {task.description && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Description
              </div>
              <p className="text-sm text-slate-300">{task.description}</p>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Prompt
            </div>
            <p className="rounded-md border border-white/5 bg-black/20 px-3 py-2 text-sm text-slate-300">
              {task.prompt}
            </p>
          </div>

          {task.modelId && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Model
              </div>
              <span className="text-sm text-slate-400">{task.modelId}</span>
            </div>
          )}

          {task.lastOutput && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Terminal className="h-3 w-3" />
                Last Output
              </div>
              <div className="max-h-32 overflow-y-auto rounded-md border border-white/5 bg-black/20 px-3 py-2 text-sm text-slate-300">
                {task.lastOutput}
              </div>
            </div>
          )}

          {task.status === 'failed' && (
            <div className="flex items-center gap-2 rounded-md bg-red-900/20 px-3 py-2 text-sm text-red-300">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              This task failed on its last run. Check the prompt and try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
