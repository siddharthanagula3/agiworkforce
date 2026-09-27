import { useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  RefreshCw,
  Terminal,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useToolStore,
  selectActionLog,
  type ActionLogEntry,
  type ActionLogStatus,
  type ActionLogEntryType,
} from '../../stores/chat/toolStore';
import type { AgentTask, AgentTaskStatus } from '../../stores/agentTaskStore';

const STATUS_ICONS: Record<
  ActionLogStatus,
  { icon: React.ElementType; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: 'text-warning-text',
    bgColor: 'bg-warning-fill/10',
    label: 'Pending',
  },
  running: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-400/10', label: 'Running' },
  success: {
    icon: CheckCircle2,
    color: 'text-success-text',
    bgColor: 'bg-success-fill/10',
    label: 'Success',
  },
  failed: {
    icon: XCircle,
    color: 'text-danger-text',
    bgColor: 'bg-danger-fill/10',
    label: 'Failed',
  },
  blocked: {
    icon: AlertCircle,
    color: 'text-warning-text',
    bgColor: 'bg-warning-fill/10',
    label: 'Blocked',
  },
};

const TYPE_ICONS: Record<ActionLogEntryType, React.ElementType> = {
  plan: RefreshCw,
  terminal: Terminal,
  filesystem: Terminal,
  browser: Terminal,
  ui: Terminal,
  mcp: Terminal,
  approval: AlertTriangle,
  metrics: CheckCircle2,
};

function getTaskStateIcon(task: AgentTask): React.ElementType | null {
  switch (task.status) {
    case 'paused':
      return Pause;
    case 'awaiting_input':
      return AlertCircle;
    case 'ready_for_review':
      return CheckCircle2;
    default:
      return null;
  }
}

function formatTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ActionTimelineProps {
  task?: AgentTask;
  maxEntries?: number;
  className?: string;
}

export function ActionTimeline({ task, maxEntries = 100, className }: ActionTimelineProps) {
  const actionLog = useToolStore(selectActionLog);

  const entries = useMemo(() => {
    return actionLog.slice(0, maxEntries);
  }, [actionLog, maxEntries]);

  if (entries.length === 0 && !task) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-8 text-center',
          className,
        )}
      >
        <Clock className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No actions recorded yet</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {task && renderTaskStateBanner(task)}

      {/* Timeline entries */}
      <div className="divide-y divide-white/[0.04]">
        {entries.map((entry) => (
          <TimelineRow key={entry.id} entry={entry} />
        ))}
      </div>

      {entries.length === 0 && task && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Clock className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No tool calls recorded for this run</p>
        </div>
      )}
    </div>
  );
}

function renderTaskStateBanner(task: AgentTask) {
  const TaskStateIcon = getTaskStateIcon(task);
  if (!TaskStateIcon) return null;

  const bannerConfig: Partial<
    Record<AgentTaskStatus, { bg: string; border: string; text: string; label: string }>
  > = {
    paused: {
      bg: 'bg-warning-fill/10',
      border: 'border-warning-fill/30',
      text: 'text-warning-text',
      label: 'Task paused',
    },
    awaiting_input: {
      bg: 'bg-warning-fill/10',
      border: 'border-warning-fill/30',
      text: 'text-warning-text',
      label: 'Awaiting input',
    },
    ready_for_review: {
      bg: 'bg-success-fill/10',
      border: 'border-success-fill/30',
      text: 'text-success-text',
      label: 'Ready for review',
    },
  };

  const config = bannerConfig[task.status];
  if (!config) return null;

  return (
    <div
      className={cn(
        'mx-3 mb-2 mt-2 flex flex-col gap-1 rounded-lg border p-3',
        config.bg,
        config.border,
      )}
    >
      <div className="flex items-center gap-2">
        <TaskStateIcon className={cn('h-4 w-4 shrink-0', config.text)} />
        <span className={cn('text-xs font-semibold', config.text)}>{config.label}</span>
      </div>
      {task.pauseReason && (
        <p className="pl-6 text-[11px] text-muted-foreground">{task.pauseReason}</p>
      )}
    </div>
  );
}

interface TimelineRowProps {
  entry: ActionLogEntry;
}

function TimelineRow({ entry }: TimelineRowProps) {
  const statusConf = STATUS_ICONS[entry.status];
  const StatusIcon = statusConf.icon;
  const TypeIcon = TYPE_ICONS[entry.type] ?? Terminal;

  const riskLevel = entry.metadata?.['riskLevel'] as string | undefined;
  const approvalType = entry.metadata?.['approvalType'] as string | undefined;
  const durationMs = entry.metadata?.['duration_ms'] as number | undefined;

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
      {/* Status dot */}
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          statusConf.bgColor,
        )}
      >
        <StatusIcon
          className={cn('h-3 w-3', statusConf.color, entry.status === 'running' && 'animate-spin')}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <span className="truncate text-xs font-medium text-foreground/80" title={entry.title}>
            {entry.title}
          </span>
          {riskLevel && <RiskBadge level={riskLevel} />}
          {durationMs !== undefined && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {formatDurationMs(durationMs)}
            </span>
          )}
        </div>

        {/* Description / result / error */}
        {(entry.description || entry.result || entry.error) && (
          <p
            className={cn(
              'mt-0.5 pl-5 text-[11px] leading-relaxed',
              entry.error ? 'text-danger-text' : 'text-muted-foreground',
            )}
          >
            {entry.error ?? entry.result ?? entry.description}
          </p>
        )}

        {/* Approval type line */}
        {approvalType && (
          <p className="mt-0.5 pl-5 text-[10px] font-mono text-muted-foreground/60">
            type: {approvalType}
          </p>
        )}

        {/* Timestamp */}
        <p className="mt-0.5 pl-5 text-[10px] text-muted-foreground/40">
          {formatTime(entry.createdAt)}
          {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
            <> &rarr; {formatTime(entry.updatedAt)}</>
          )}
        </p>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, string> = {
    high: 'bg-danger-fill/10 text-danger-text border-danger-fill/30',
    medium: 'bg-warning-fill/10 text-warning-text border-warning-fill/30',
    low: 'bg-success-fill/10 text-success-text border-success-fill/30',
  };
  const cls = cfg[level] ?? cfg['low']!;
  return (
    <span
      className={cn(
        'rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide',
        cls,
      )}
    >
      {level}
    </span>
  );
}
