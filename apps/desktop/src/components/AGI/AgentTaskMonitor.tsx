import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Loader2,
  Pause,
  Play,
  StopCircle,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAgentTaskStore, type AgentTask } from '../../stores/agentTaskStore';
import {
  useBackgroundTaskStore,
  subscribeToTimeoutWarnings,
  type Task as BgTask,
} from '../../stores/backgroundTaskStore';
import { ActionTimeline } from './ActionTimeline';
import { OperatorDrillDown } from './OperatorDrillDown';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';

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
  paused: {
    icon: Pause,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    label: 'Paused',
  },
  expired: {
    icon: AlertCircle,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    label: 'Expired',
  },
  recovering: {
    icon: Loader2,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    label: 'Recovering',
  },
};

function TaskRow({ task }: { task: AgentTask }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'operator'>('details');
  const cancelTask = useAgentTaskStore((s) => s.cancelTask);
  const submitGoal = useAgentTaskStore((s) => s.submitGoal);
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

  const handleRetry = useCallback(async () => {
    try {
      await submitGoal(task.goal);
      toast.success('Task retried');
    } catch {
      toast.error('Failed to retry task');
    }
  }, [submitGoal, task.goal]);

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

        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            config.bgColor,
            config.color,
          )}
        >
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
        <div className="border-t border-white/5 bg-white/[0.02]">
          {/* Tab bar */}
          <div className="flex border-b border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition',
                activeTab === 'details'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition',
                activeTab === 'timeline'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <History className="h-3 w-3" />
              Action Log
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('operator')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition',
                activeTab === 'operator'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              Operator View
            </button>
          </div>

          {/* Timeline tab */}
          {activeTab === 'timeline' && (
            <SectionErrorBoundary sectionName="Action Timeline" compact>
              <ActionTimeline task={task} maxEntries={50} />
            </SectionErrorBoundary>
          )}

          {/* Operator drill-down tab */}
          {activeTab === 'operator' && (
            <SectionErrorBoundary sectionName="Operator View" compact>
              <OperatorDrillDown task={task} />
            </SectionErrorBoundary>
          )}

          {/* Details tab */}
          {activeTab === 'details' && (
            <div className="px-4 py-3">
              <div className="space-y-2 text-sm">
                <div className="text-slate-300">
                  <span className="font-medium text-slate-400">Goal: </span>
                  {task.goal}
                </div>

                {task.executionMode && (
                  <div className="text-slate-400">
                    <span className="font-medium">Mode: </span>
                    <span className="capitalize">{task.executionMode}</span>
                  </div>
                )}

                {task.iterations !== undefined && (
                  <div className="text-slate-400">
                    <span className="font-medium">Iterations: </span>
                    {task.iterations}
                  </div>
                )}

                {task.swarmMetrics && (
                  <div className="rounded-md bg-purple-900/20 p-2 text-purple-300">
                    <div className="text-xs font-medium uppercase tracking-wide text-purple-400 mb-1">
                      Swarm Metrics
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span>Succeeded: {task.swarmMetrics.succeeded}</span>
                      <span>Failed: {task.swarmMetrics.failed}</span>
                      <span>Wall time: {(task.swarmMetrics.wallTimeMs / 1000).toFixed(1)}s</span>
                      <span>Speedup: {task.swarmMetrics.speedupRatio.toFixed(1)}x</span>
                      <span>Max parallel: {task.swarmMetrics.maxParallelism}</span>
                      <span>Critical path: {task.swarmMetrics.criticalPathLength}</span>
                    </div>
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

                {task.status === 'failed' && (
                  <button
                    type="button"
                    aria-label="Retry failed task"
                    onClick={() => void handleRetry()}
                    className="mt-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Retry Task
                  </button>
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
      )}
    </div>
  );
}

// ── Background Task Row (from backgroundTaskStore) ─────────────────────────

const BG_STATUS_CONFIG: Record<
  BgTask['status'],
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  Queued: { icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-400/10', label: 'Queued' },
  Running: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-400/10', label: 'Running' },
  Paused: { icon: Pause, color: 'text-amber-400', bgColor: 'bg-amber-400/10', label: 'Paused' },
  Completed: {
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    label: 'Done',
  },
  Failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/10', label: 'Failed' },
  Cancelled: {
    icon: StopCircle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    label: 'Cancelled',
  },
};

function BgTaskRow({ task }: { task: BgTask }) {
  const [expanded, setExpanded] = useState(false);
  const cancelTask = useBackgroundTaskStore((s) => s.cancelTask);
  const pauseTask = useBackgroundTaskStore((s) => s.pauseTask);
  const resumeTask = useBackgroundTaskStore((s) => s.resumeTask);

  const config = BG_STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;
  const truncatedName = task.name.length > 60 ? task.name.slice(0, 57) + '...' : task.name;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        )}

        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            config.bgColor,
            config.color,
          )}
        >
          <StatusIcon className={cn('h-3 w-3', task.status === 'Running' && 'animate-spin')} />
          {config.label}
        </span>

        <span className="flex-1 truncate text-sm text-slate-200" title={task.name}>
          {truncatedName}
        </span>

        {task.progress > 0 && task.progress < 100 && (
          <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">
            {task.progress}%
          </span>
        )}

        <span className="flex-shrink-0 text-xs text-slate-500">
          {formatRelativeTime(task.completed_at ?? task.created_at)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="space-y-2 text-sm">
            {task.description && (
              <div className="text-slate-300">
                <span className="font-medium text-slate-400">Description: </span>
                {task.description}
              </div>
            )}

            <div className="text-slate-400">
              <span className="font-medium">Priority: </span>
              <span className="capitalize">{task.priority}</span>
            </div>

            {task.result?.error && (
              <div className="flex items-start gap-2 rounded-md bg-red-900/20 p-2 text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {task.result.error}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              {task.status === 'Running' && (
                <button
                  type="button"
                  onClick={() => void pauseTask(task.id)}
                  className="rounded-md bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-600/30"
                >
                  <Pause className="inline h-3 w-3 mr-1" />
                  Pause
                </button>
              )}
              {task.status === 'Paused' && (
                <button
                  type="button"
                  onClick={() => void resumeTask(task.id)}
                  className="rounded-md bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 transition hover:bg-blue-600/30"
                >
                  <Play className="inline h-3 w-3 mr-1" />
                  Resume
                </button>
              )}
              {(task.status === 'Queued' ||
                task.status === 'Running' ||
                task.status === 'Paused') && (
                <button
                  type="button"
                  onClick={() => void cancelTask(task.id)}
                  className="rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-600/30"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Monitor ───────────────────────────────────────────────────────────

export function AgentTaskMonitor() {
  const tasks = useAgentTaskStore((s) => s.tasks);
  const loading = useAgentTaskStore((s) => s.loading);
  const fetchTasks = useAgentTaskStore((s) => s.fetchTasks);
  const getTaskStatus = useAgentTaskStore((s) => s.getTaskStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Background task store
  const bgTasks = useBackgroundTaskStore((s) => s.tasks);
  const bgLoading = useBackgroundTaskStore((s) => s.isLoading);
  const listBgTasks = useBackgroundTaskStore((s) => s.listTasks);
  const fetchBgStats = useBackgroundTaskStore((s) => s.fetchStats);

  // Initialize both stores and subscribe to timeout warnings
  useEffect(() => {
    void fetchTasks();
    void listBgTasks();
    void fetchBgStats();
    const cleanupTimeoutWarnings = subscribeToTimeoutWarnings();
    return () => {
      cleanupTimeoutWarnings();
    };
  }, [fetchTasks, listBgTasks, fetchBgStats]);

  // Auto-refresh running tasks every 5 seconds
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running' || t.status === 'pending');
    const hasBgRunning = bgTasks.some((t) => t.status === 'Running' || t.status === 'Queued');

    if (hasRunning || hasBgRunning) {
      intervalRef.current = setInterval(() => {
        const runningTasks = useAgentTaskStore
          .getState()
          .tasks.filter((t) => t.status === 'running' || t.status === 'pending');
        for (const t of runningTasks) {
          void getTaskStatus(t.id);
        }
        // Read fresh from store to avoid stale closure over hasBgRunning
        const currentBgTasks = useBackgroundTaskStore.getState().tasks;
        const currentBgRunning = currentBgTasks.some(
          (t) => t.status === 'Running' || t.status === 'Queued',
        );
        if (currentBgRunning) {
          void useBackgroundTaskStore.getState().listTasks();
        }
      }, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tasks, bgTasks, getTaskStatus]);

  const isLoading = (loading && tasks.length === 0) || (bgLoading && bgTasks.length === 0);
  const isEmpty = tasks.length === 0 && bgTasks.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading tasks...
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-500">
        No tasks yet. Create one to get started.
      </div>
    );
  }

  // Sort agent tasks: running first, then pending, then by createdAt desc
  const sortedAgentTasks = [...tasks].sort((a, b) => {
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

  // Sort background tasks: running first, then queued, paused, etc.
  const sortedBgTasks = [...bgTasks].sort((a, b) => {
    const order: Record<string, number> = {
      Running: 0,
      Queued: 1,
      Paused: 2,
      Completed: 3,
      Failed: 4,
      Cancelled: 5,
    };
    const aOrder = order[a.status] ?? 6;
    const bOrder = order[b.status] ?? 6;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div>
      {/* Agent tasks */}
      {sortedAgentTasks.length > 0 && (
        <div>
          {bgTasks.length > 0 && (
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-white/[0.02] border-b border-white/5">
              Agent Tasks
            </div>
          )}
          <div className="divide-y divide-white/5">
            {sortedAgentTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Background queue tasks */}
      {sortedBgTasks.length > 0 && (
        <div>
          {tasks.length > 0 && (
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-white/[0.02] border-b border-white/5">
              Background Tasks
            </div>
          )}
          <div className="divide-y divide-white/5">
            {sortedBgTasks.map((task) => (
              <BgTaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
