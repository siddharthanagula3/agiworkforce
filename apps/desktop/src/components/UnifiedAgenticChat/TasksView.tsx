// TasksView.tsx
// Full-page tasks management view. Lists agent tasks with real-time Tauri event updates,
// filterable by status, with expandable SubtaskTimeline per task.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ListTodo,
  Loader2,
  Pause,
  Play,
  Square,
  CalendarClock,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { listen, invoke } from '../../lib/tauri-mock';
import { useAgentTaskStore, type AgentTask } from '../../stores/agentTaskStore';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/ScrollArea';
import { TaskCreationDialog } from './TaskCreationDialog';
import { SubtaskTimeline, type SubtaskStep } from './SubtaskTimeline';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FilterTab = 'active' | 'completed' | 'failed' | 'scheduled';

interface LoopStatusPayload {
  step: number;
  total: number;
  description: string;
  status: string;
  taskId?: string;
  goal_id?: string;
}

interface LoopStartedPayload {
  taskId?: string;
  goal_id?: string;
}

interface LoopEndedPayload {
  taskId?: string;
  goal_id?: string;
  success?: boolean;
}

// Per-task live step tracking (in-memory, not persisted)
type LiveStepsMap = Record<string, SubtaskStep[]>;
type LiveProgressMap = Record<string, { step: number; total: number }>;

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AgentTask['status'],
  { label: string; textColor: string; bgColor: string; dotClass: string }
> = {
  pending: {
    label: 'Pending',
    textColor: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    dotClass: 'bg-yellow-400',
  },
  running: {
    label: 'Running',
    textColor: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    dotClass: 'bg-blue-400 animate-pulse',
  },
  completed: {
    label: 'Completed',
    textColor: 'text-green-400',
    bgColor: 'bg-green-400/10',
    dotClass: 'bg-green-400',
  },
  failed: {
    label: 'Failed',
    textColor: 'text-red-400',
    bgColor: 'bg-red-400/10',
    dotClass: 'bg-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    textColor: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10',
    dotClass: 'bg-zinc-500',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatElapsed(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
  } catch {
    return '';
  }
}

function mapStatusToFilter(status: AgentTask['status']): FilterTab {
  switch (status) {
    case 'running':
    case 'pending':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'active';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentTask['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        cfg.bgColor,
        cfg.textColor,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressBar
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-teal-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
        {current}/{total}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskCard
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: AgentTask;
  liveSteps: SubtaskStep[];
  liveStep: number;
  liveTotal: number;
}

function TaskCard({ task, liveSteps, liveStep, liveTotal }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cancelTask = useAgentTaskStore((s) => s.cancelTask);

  const handleCancel = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await cancelTask(task.id);
        toast.success('Task cancelled');
      } catch {
        toast.error('Failed to cancel task');
      }
    },
    [cancelTask, task.id],
  );

  const handlePause = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await invoke('agi_pause_task', { taskId: task.id });
        toast.success('Task paused');
      } catch {
        toast.error('Failed to pause task');
      }
    },
    [task.id],
  );

  const handleResume = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await invoke('agi_resume_task', { taskId: task.id });
        toast.success('Task resumed');
      } catch {
        toast.error('Failed to resume task');
      }
    },
    [task.id],
  );

  const showProgress = task.status === 'running' && liveTotal > 0;

  const timeLabel =
    task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
      ? task.completedAt
        ? `Ended ${formatElapsed(task.completedAt)}`
        : `Started ${formatElapsed(task.createdAt)}`
      : `Started ${formatElapsed(task.createdAt)}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.04]"
      >
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="mt-0.5 shrink-0 text-zinc-500"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            {task.iterations !== undefined && task.status !== 'running' && (
              <span className="text-xs text-zinc-600">{task.iterations} iterations</span>
            )}
          </div>

          <p className="mt-1.5 line-clamp-2 text-sm font-medium text-zinc-200" title={task.goal}>
            {task.goal}
          </p>

          {showProgress && (
            <div className="mt-2">
              <ProgressBar current={liveStep} total={liveTotal} />
            </div>
          )}

          <p className="mt-1.5 text-xs text-zinc-600">{timeLabel}</p>
        </div>

        {/* Action buttons — stop propagation so click doesn't expand */}
        {(task.status === 'running' || task.status === 'pending') && (
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {task.status === 'running' && (
              <button
                type="button"
                onClick={handlePause}
                title="Pause task"
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-yellow-400"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            )}
            {task.status === 'pending' && (
              <button
                type="button"
                onClick={handleResume}
                title="Resume task"
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-green-400"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCancel}
              title="Cancel task"
              className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-red-400"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.22, ease: 'easeInOut' },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
              {liveSteps.length > 0 && <SubtaskTimeline taskId={task.id} steps={liveSteps} />}

              {task.result && (
                <div className="rounded-lg bg-green-900/20 px-3 py-2 text-sm text-green-300">
                  <span className="font-medium text-green-400">Result: </span>
                  {task.result}
                </div>
              )}

              {task.error && (
                <div className="rounded-lg bg-red-900/20 px-3 py-2 text-sm text-red-300">
                  <span className="font-medium text-red-400">Error: </span>
                  {task.error}
                </div>
              )}

              {task.insights && task.insights.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Insights
                  </p>
                  <ul className="space-y-1">
                    {task.insights.map((insight, i) => (
                      <li key={i} className="text-xs text-zinc-400">
                        &bull; {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {liveSteps.length === 0 && !task.result && !task.error && (
                <p className="text-xs text-zinc-600">
                  {task.status === 'running'
                    ? 'Waiting for first step...'
                    : 'No step details available.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  tab: FilterTab;
  onNew: () => void;
}

function EmptyState({ tab, onNew }: EmptyStateProps) {
  const messages: Record<FilterTab, { icon: React.ElementType; text: string }> = {
    active: { icon: Zap, text: 'No active tasks. Launch one to get started.' },
    completed: { icon: CheckCircle2, text: 'No completed tasks yet.' },
    failed: { icon: XCircle, text: 'No failed tasks.' },
    scheduled: { icon: CalendarClock, text: 'No scheduled tasks.' },
  };
  const { icon: Icon, text } = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Icon className="h-10 w-10 text-zinc-700" />
      <p className="text-sm text-zinc-500">{text}</p>
      {tab === 'active' && (
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TasksView
// ─────────────────────────────────────────────────────────────────────────────

export function TasksView() {
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [liveStepsMap, setLiveStepsMap] = useState<LiveStepsMap>({});
  const [liveProgressMap, setLiveProgressMap] = useState<LiveProgressMap>({});

  const tasks = useAgentTaskStore((s) => s.tasks);
  const loading = useAgentTaskStore((s) => s.loading);
  const fetchTasks = useAgentTaskStore((s) => s.fetchTasks);
  const getTaskStatus = useAgentTaskStore((s) => s.getTaskStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load
  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  // Poll running tasks every 5 s
  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === 'running' || t.status === 'pending');

    if (hasActive) {
      intervalRef.current = setInterval(() => {
        const activeTasks = useAgentTaskStore
          .getState()
          .tasks.filter((t) => t.status === 'running' || t.status === 'pending');
        for (const t of activeTasks) {
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

  // Tauri real-time event listeners
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      // Task started
      const u1 = await listen<LoopStartedPayload>('agentic:loop-started', ({ payload }) => {
        const id = payload.taskId ?? payload.goal_id;
        if (!id) return;
        useAgentTaskStore.setState((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'running' as const } : t)),
        }));
      });
      unlisteners.push(u1);

      // Step update
      const u2 = await listen<LoopStatusPayload>('agentic:loop-status', ({ payload }) => {
        const id = payload.taskId ?? payload.goal_id;
        if (!id) return;

        const stepId = `${id}_step_${payload.step}`;
        const stepStatus: SubtaskStep['status'] =
          payload.status === 'done'
            ? 'done'
            : payload.status === 'failed'
              ? 'failed'
              : payload.status === 'running'
                ? 'running'
                : 'pending';

        const newStep: SubtaskStep = {
          id: stepId,
          description: payload.description,
          status: stepStatus,
          startedAt: new Date(),
          completedAt: stepStatus === 'done' || stepStatus === 'failed' ? new Date() : undefined,
        };

        setLiveStepsMap((prev) => {
          const existing = prev[id] ?? [];
          const idx = existing.findIndex((s) => s.id === stepId);
          const updated =
            idx >= 0
              ? existing.map((s, i) => (i === idx ? { ...s, ...newStep } : s))
              : [...existing, newStep];
          return { ...prev, [id]: updated };
        });

        setLiveProgressMap((prev) => ({
          ...prev,
          [id]: { step: payload.step, total: payload.total },
        }));
      });
      unlisteners.push(u2);

      // Task ended
      const u3 = await listen<LoopEndedPayload>('agentic:loop-ended', ({ payload }) => {
        const id = payload.taskId ?? payload.goal_id;
        if (!id) return;
        const success = payload.success !== false;

        useAgentTaskStore.setState((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: success ? ('completed' as const) : ('failed' as const),
                  completedAt: new Date().toISOString(),
                }
              : t,
          ),
        }));

        // Mark any still-running step as done
        setLiveStepsMap((prev) => {
          const steps = prev[id];
          if (!steps) return prev;
          return {
            ...prev,
            [id]: steps.map((s) =>
              s.status === 'running'
                ? { ...s, status: 'done' as const, completedAt: new Date() }
                : s,
            ),
          };
        });
      });
      unlisteners.push(u3);

      // message-consumed — no-op, kept for completeness
      const u4 = await listen('agentic:message-consumed', () => {});
      unlisteners.push(u4);
    };

    void setup();

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  // Tab definitions
  const tabs: ReadonlyArray<{ id: FilterTab; label: string; icon: React.ElementType }> = [
    { id: 'active', label: 'Active', icon: Zap },
    { id: 'completed', label: 'Completed', icon: CheckCircle2 },
    { id: 'failed', label: 'Failed', icon: XCircle },
    { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
  ];

  // Tab counts
  const counts = useMemo<Record<FilterTab, number>>(() => {
    const result: Record<FilterTab, number> = {
      active: 0,
      completed: 0,
      failed: 0,
      scheduled: 0,
    };
    for (const t of tasks) {
      const key = mapStatusToFilter(t.status);
      result[key] += 1;
    }
    return result;
  }, [tasks]);

  // Filtered + sorted task list
  const filtered = useMemo(() => {
    if (activeTab === 'scheduled') return [];

    return tasks
      .filter((t) => mapStatusToFilter(t.status) === activeTab)
      .filter((t) => {
        if (!searchQuery.trim()) return true;
        return t.goal.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (b.status === 'running' && a.status !== 'running') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [tasks, activeTab, searchQuery]);

  return (
    <div className="flex h-full flex-col bg-[#0b0c14]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <ListTodo className="h-5 w-5 text-teal-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Tasks</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-teal-500/40 focus:ring-1 focus:ring-teal-500/20"
          />
        </div>
      </div>

      {/* ── Tab filter ─────────────────────────────────────────────────────── */}
      <div className="flex border-b border-white/10 px-6">
        {tabs.map(({ id, label, icon: Icon }) => {
          const count = counts[id];
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition',
                isActive
                  ? 'border-teal-500 text-teal-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    isActive ? 'bg-teal-500/20 text-teal-400' : 'bg-white/10 text-zinc-500',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Task list ──────────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-6">
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <EmptyState tab={activeTab} onNew={() => setDialogOpen(true)} />
            ) : (
              filtered.map((task) => {
                const steps = liveStepsMap[task.id] ?? [];
                const progress = liveProgressMap[task.id] ?? { step: 0, total: 0 };
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    liveSteps={steps}
                    liveStep={progress.step}
                    liveTotal={progress.total}
                  />
                );
              })
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* ── Creation dialog ────────────────────────────────────────────────── */}
      <TaskCreationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
