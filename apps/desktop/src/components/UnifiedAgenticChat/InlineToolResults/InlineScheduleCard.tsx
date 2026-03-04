import { Calendar, Loader2, AlertCircle, Clock, CheckCircle2, PauseCircle } from 'lucide-react';
import type { ToolResultProps } from './index';
import { cn } from '@/lib/utils';

interface ScheduleData {
  name?: string;
  schedule?: string;
  nextRun?: string;
  status?: 'active' | 'paused' | 'completed' | string;
  lastResult?: string;
}

interface ScheduleStatusConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
}

const STATUS_CONFIG_MAP: Partial<Record<string, ScheduleStatusConfig>> = {
  active: {
    label: 'Active',
    color: 'text-emerald-400',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  paused: {
    label: 'Paused',
    color: 'text-amber-400',
    icon: <PauseCircle className="h-3 w-3" />,
  },
  completed: {
    label: 'Completed',
    color: 'text-zinc-400',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

const DEFAULT_STATUS_CONFIG: ScheduleStatusConfig = {
  label: 'Active',
  color: 'text-emerald-400',
  icon: <CheckCircle2 className="h-3 w-3" />,
};

function parseCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, month, dow] = parts;
  if (min === '*' && hour === '*') return 'Every minute';
  if (dom === '*' && month === '*' && dow === '*') {
    if (min === '0' && hour !== '*') return `Daily at ${hour}:00`;
    return `Every ${hour}h ${min}m`;
  }
  return cron;
}

export function InlineScheduleCard({ result, status }: ToolResultProps) {
  const data = result?.data as ScheduleData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Loading schedule...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Schedule operation failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    name = 'Scheduled Task',
    schedule,
    nextRun,
    status: taskStatus = 'active',
    lastResult,
  } = data;

  const statusCfg = STATUS_CONFIG_MAP[taskStatus] ?? DEFAULT_STATUS_CONFIG;

  const formattedNextRun = nextRun
    ? new Date(nextRun).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : undefined;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800/60 border-b border-white/10">
        <Calendar className="h-4 w-4 text-sky-400 shrink-0" />
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{name}</span>
        <span className={cn('flex items-center gap-1 text-xs font-medium', statusCfg.color)}>
          {statusCfg.icon}
          {statusCfg.label}
        </span>
      </div>

      <div className="p-3 space-y-2">
        {schedule && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Schedule:</span>
            <code className="text-zinc-300 bg-zinc-800/60 px-1.5 py-0.5 rounded font-mono text-xs">
              {schedule}
            </code>
            <span className="text-zinc-500">&mdash; {parseCron(schedule)}</span>
          </div>
        )}

        {formattedNextRun && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Clock className="h-3 w-3 text-zinc-500" />
            <span>Next run: {formattedNextRun}</span>
          </div>
        )}

        {lastResult && (
          <div className="p-2 rounded bg-zinc-800/40 border border-white/5">
            <p className="text-xs text-zinc-500 font-medium mb-0.5">Last Result</p>
            <p className="text-xs text-zinc-400 line-clamp-2">{lastResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
