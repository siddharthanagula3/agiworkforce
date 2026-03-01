import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  StopCircle,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAgentTaskStore, type AgentTask } from '../../stores/agentTaskStore';

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_CONFIG: Record<
  AgentTask['status'],
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    label: 'Pending',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    label: 'Running',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    label: 'Failed',
  },
  cancelled: {
    icon: StopCircle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    label: 'Cancelled',
  },
};

function TaskRow({ task }: { task: AgentTask }) {
  const [expanded, setExpanded] = useState(false);
  const cancelTask = useAgentTaskStore((s) => s.cancelTask);
  const fetchInsights = useAgentTaskStore((s) => s.fetchInsights);
  const [insights, setInsights] = useState<string[]>(task.insights ?? []);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const config = STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;

  const handleExpand = useCallback(async () => {
    const opening = !expanded;
    setExpanded(opening);

    if (opening && insights.length === 0 && !loadingInsights) {
      setLoadingInsights(true);
      const result = await fetchInsights(task.id);
      setInsights(result);
      setLoadingInsights(false);
    }
  }, [expanded, insights.length, loadingInsights, fetchInsights, task.id]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelTask(task.id);
      toast.success('Task cancelled');
    } catch {
      toast.error('Failed to cancel task');
    }
  }, [cancelTask, task.id]);

  const truncatedGoal = task.goal.length > 60 ? task.goal.slice(0, 57) + '...' : task.goal;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        )}

        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', config.bgColor, config.color)}>
          <StatusIcon className={cn('h-3 w-3', task.status === 'running' && 'animate-spin')} />
          {config.label}
        </span>

        <span className="flex-1 truncate text-sm text-slate-200" title={task.goal}>
          {truncatedGoal}
        </span>

        <span className="flex-shrink-0 text-xs text-slate-500">
          {task.completedAt
            ? formatRelativeTime(task.completedAt)
            : formatRelativeTime(task.createdAt)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="space-y-2 text-sm">
            <div className="text-slate-300">
              <span className="font-medium text-slate-400">Goal: </span>
              {task.goal}
            </div>

            {task.iterations !== undefined && (
              <div className="text-slate-400">
                <span className="font-medium">Iterations: </span>
                {task.iterations}
              </div>
            )}

            {task.result && (
              <div className="rounded-md bg-green-900/20 p-2 text-green-300">
                <span className="font-medium">Result: </span>
                {task.result}
              </div>
            )}

            {task.error && (
              <div className="flex items-start gap-2 rounded-md bg-red-900/20 p-2 text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {task.error}
              </div>
            )}

            {loadingInsights && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading insights...
              </div>
            )}

            {insights.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Insights
                </div>
                <ul className="space-y-1">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-sm text-slate-300">
                      &bull; {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(task.status === 'pending' || task.status === 'running') && (
              <button
                type="button"
                onClick={() => void handleCancel()}
                className="mt-2 rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-600/30"
              >
                Cancel Task
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentTaskMonitor() {
  const tasks = useAgentTaskStore((s) => s.tasks);
  const loading = useAgentTaskStore((s) => s.loading);
  const fetchTasks = useAgentTaskStore((s) => s.fetchTasks);
  const getTaskStatus = useAgentTaskStore((s) => s.getTaskStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh running tasks every 5 seconds
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running' || t.status === 'pending');

    if (hasRunning) {
      intervalRef.current = setInterval(() => {
        const runningTasks = useAgentTaskStore
          .getState()
          .tasks.filter((t) => t.status === 'running' || t.status === 'pending');
        for (const t of runningTasks) {
          void getTaskStatus(t.id);
        }
      }, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tasks, getTaskStatus]);

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading tasks...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-500">
        No tasks yet. Create one to get started.
      </div>
    );
  }

  // Sort: running first, then pending, then by createdAt desc
  const sorted = [...tasks].sort((a, b) => {
    const order: Record<string, number> = {
      running: 0,
      pending: 1,
      completed: 2,
      failed: 3,
      cancelled: 4,
    };
    const aOrder = order[a.status] ?? 5;
    const bOrder = order[b.status] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="divide-y divide-white/5">
      {sorted.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  );
}
