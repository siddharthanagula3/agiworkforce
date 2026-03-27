import { formatDistanceToNowStrict } from 'date-fns';
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  Globe,
  Loader2,
  Pause,
  Search,
  TerminalSquare,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { invoke, isTauri } from '@/lib/tauri-mock';
import { cn } from '@/lib/utils';
import {
  useUnifiedChatStore,
  type ActionTrailEntry,
  type BackgroundTask,
  type BackgroundTaskStatus,
} from '@/stores/unified/unifiedChatStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Progress } from '../ui/Progress';
import { ScrollArea } from '../ui/ScrollArea';

interface BackgroundTasksPanelProps {
  className?: string;
  onClose?: () => void;
  maxHeight?: string;
}

const ACTIVE_ACTION_TYPES = new Set<ActionTrailEntry['type']>([
  'thinking',
  'searching',
  'coding',
  'running',
]);

function isTaskActive(status: BackgroundTaskStatus) {
  return status === 'running' || status === 'queued' || status === 'paused';
}

function formatRelativeTime(timestamp?: Date) {
  if (!timestamp) return 'just now';
  return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
}

function formatElapsedTime(startedAt?: Date, completedAt?: Date) {
  if (!startedAt) return 'Not started';

  const endTime = completedAt ? new Date(completedAt) : new Date();
  const elapsedMs = Math.max(endTime.getTime() - new Date(startedAt).getTime(), 0);

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getTaskStatusIcon(status: BackgroundTaskStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-agent-active" />;
    case 'queued':
      return <Clock className="h-4 w-4 text-agent-warning" />;
    case 'paused':
      return <Pause className="h-4 w-4 text-muted-foreground" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-agent-success" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-agent-error" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function getTaskBadgeVariant(
  status: BackgroundTaskStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
      return 'default';
    case 'queued':
    case 'paused':
      return 'secondary';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getActionIcon(entry: ActionTrailEntry) {
  const lowerMessage = entry.message.toLowerCase();

  if (
    lowerMessage.includes('browser') ||
    lowerMessage.includes('url') ||
    lowerMessage.includes('website')
  ) {
    return <Globe className="h-4 w-4 text-sky-400" />;
  }
  if (lowerMessage.includes('terminal') || lowerMessage.includes('command')) {
    return <TerminalSquare className="h-4 w-4 text-emerald-400" />;
  }

  switch (entry.type) {
    case 'thinking':
      return <Brain className="h-4 w-4 text-agent-thinking" />;
    case 'searching':
      return <Search className="h-4 w-4 text-teal-400" />;
    case 'coding':
      return <Code2 className="h-4 w-4 text-agent-active" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-agent-warning" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-agent-success" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-agent-error" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function getActionAccent(entry: ActionTrailEntry) {
  switch (entry.type) {
    case 'thinking':
      return 'border-agent-thinking/20 bg-agent-thinking/5';
    case 'searching':
      return 'border-teal-500/20 bg-teal-500/5';
    case 'coding':
      return 'border-agent-active/20 bg-agent-active/5';
    case 'running':
      return 'border-agent-warning/20 bg-agent-warning/5';
    case 'completed':
      return 'border-agent-success/20 bg-agent-success/5';
    case 'error':
      return 'border-agent-error/20 bg-agent-error/5';
    default:
      return 'border-border/50 bg-surface-elevated';
  }
}

function TaskItem({
  task,
  isCancelling,
  onCancel,
}: {
  task: BackgroundTask;
  isCancelling: boolean;
  onCancel: (taskId: string) => Promise<void>;
}) {
  const isActive = isTaskActive(task.status);
  const canCancel = isTauri && (task.status === 'running' || task.status === 'queued');

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        isActive ? 'border-primary/15 bg-primary/5' : 'border-border/50 bg-surface-elevated',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-1 items-start gap-3">
          <div className="mt-0.5 shrink-0">{getTaskStatusIcon(task.status)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
              <Badge variant={getTaskBadgeVariant(task.status)} className="capitalize">
                {task.status}
              </Badge>
            </div>
            {task.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
            ) : null}
          </div>
        </div>

        {canCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void onCancel(task.id)}
            disabled={isCancelling}
            className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Cancel ${task.name}`}
          >
            {isCancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </div>

      {isActive ? (
        <div className="mt-3 space-y-2">
          <Progress
            value={task.progress}
            className="h-1.5 bg-background/70"
            indicatorClassName="bg-primary"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatElapsedTime(task.startedAt, task.completedAt)}</span>
            <span className="tabular-nums">{Math.round(task.progress || 0)}%</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatRelativeTime(task.completedAt ?? task.createdAt)}</span>
          <span>{formatElapsedTime(task.startedAt, task.completedAt)}</span>
        </div>
      )}

      {task.status === 'failed' && task.error ? (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {task.error}
        </div>
      ) : null}
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActionTrailEntry }) {
  const isActive = ACTIVE_ACTION_TYPES.has(entry.type);
  const progress =
    entry.progress ??
    (entry.currentStep && entry.totalSteps
      ? Math.round((entry.currentStep / entry.totalSteps) * 100)
      : undefined);

  const resultPreview =
    typeof entry.metadata?.['result_preview'] === 'string'
      ? String(entry.metadata?.['result_preview']).trim()
      : null;

  return (
    <div className={cn('rounded-2xl border px-4 py-3', getActionAccent(entry))}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{getActionIcon(entry)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{entry.message}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatRelativeTime(entry.timestamp)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {entry.currentStep !== undefined && entry.totalSteps !== undefined ? (
              <span className="tabular-nums">
                Step {entry.currentStep}/{entry.totalSteps}
              </span>
            ) : null}
            {typeof entry.metadata?.['tool_call_id'] === 'string' ? (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Tool call
              </span>
            ) : null}
          </div>

          {resultPreview && !isActive ? (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{resultPreview}</p>
          ) : null}

          {progress !== undefined && isActive ? (
            <div className="mt-3 space-y-1.5">
              <Progress
                value={progress}
                className="h-1.5 bg-background/70"
                indicatorClassName="bg-primary"
              />
              <div className="flex items-center justify-end text-[11px] text-muted-foreground tabular-nums">
                {progress}%
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  subtitle,
}: {
  title: string;
  count?: number;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {typeof count === 'number' ? (
        <Badge variant="outline" className="text-[11px] tabular-nums">
          {count}
        </Badge>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface-elevated px-6 py-10 text-center">
      <div className="mb-4 rounded-full border border-border/60 bg-background/80 p-3">
        <Activity className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No active work right now</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Live research, tool execution, and background jobs appear here while the website agent is
        working.
      </p>
    </div>
  );
}

export function BackgroundTasksPanel({
  className,
  onClose,
  maxHeight = '400px',
}: BackgroundTasksPanelProps) {
  const { backgroundTasks, actionTrail, updateBackgroundTask } = useUnifiedChatStore(
    useShallow((state) => ({
      backgroundTasks: state.backgroundTasks,
      actionTrail: state.actionTrail,
      updateBackgroundTask: state.updateBackgroundTask,
    })),
  );
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => backgroundTasks.filter((task) => isTaskActive(task.status)),
    [backgroundTasks],
  );
  const sortedTasks = useMemo(
    () =>
      [...backgroundTasks].sort((left, right) => {
        const leftActive = isTaskActive(left.status);
        const rightActive = isTaskActive(right.status);
        if (leftActive !== rightActive) return leftActive ? -1 : 1;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [backgroundTasks],
  );
  const liveEntries = useMemo(
    () =>
      actionTrail
        .filter((entry) => ACTIVE_ACTION_TYPES.has(entry.type))
        .slice(-5)
        .reverse(),
    [actionTrail],
  );
  const recentEntries = useMemo(
    () =>
      actionTrail
        .filter((entry) => !ACTIVE_ACTION_TYPES.has(entry.type))
        .slice(-6)
        .reverse(),
    [actionTrail],
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      if (!isTauri) return;

      setCancellingTaskId(taskId);
      try {
        await invoke('background_task_cancel', { taskId });
        updateBackgroundTask(taskId, {
          status: 'cancelled',
          completedAt: new Date(),
        });
      } catch (error) {
        console.error('[BackgroundTasksPanel] Failed to cancel task:', error);
      } finally {
        setCancellingTaskId(null);
      }
    },
    [updateBackgroundTask],
  );

  const hasContent = liveEntries.length > 0 || recentEntries.length > 0 || sortedTasks.length > 0;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl',
        className,
      )}
    >
      <div className="border-b border-border/60 bg-surface-elevated/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Agent Activity</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Live execution, recent results, and background jobs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] tabular-nums">
              {liveEntries.length + activeTasks.length} live
            </Badge>
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onClose}
                className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
                aria-label="Close activity panel"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Live</div>
            <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
              {liveEntries.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Jobs</div>
            <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
              {activeTasks.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recent</div>
            <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
              {recentEntries.length}
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1" style={{ maxHeight }}>
        <div className="space-y-5 p-4">
          {!hasContent ? <EmptyState /> : null}

          {liveEntries.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader
                title="Live Now"
                count={liveEntries.length}
                subtitle="What the agent is doing right now."
              />
              <div className="space-y-2.5">
                {liveEntries.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ) : null}

          {recentEntries.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader
                title="Recent Results"
                count={recentEntries.length}
                subtitle="Latest completions, failures, and handoffs."
              />
              <div className="space-y-2.5">
                {recentEntries.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ) : null}

          {sortedTasks.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader
                title="Background Jobs"
                count={sortedTasks.length}
                subtitle="Long-running work that continues outside the immediate chat reply."
              />
              <div className="space-y-2.5">
                {sortedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    isCancelling={cancellingTaskId === task.id}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export default BackgroundTasksPanel;
