/**
 * AgentStatusCard
 *
 * Individual card displaying a single agent session's status.
 * Shows name, status, current action, progress bar, and elapsed time.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, XCircle, Pause, Loader2, Clock, Wrench, Ban } from 'lucide-react';
import type { AgentSession, AgentSessionStatus } from '@agiworkforce/types';
import { Progress } from '@shared/ui/progress';
import { cn } from '@shared/lib/utils';

interface AgentStatusCardProps {
  session: AgentSession;
  className?: string;
}

/** Format elapsed time from ISO start timestamp to human-readable string. */
function formatElapsedTime(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Get status icon, color, and label for display. */
function getStatusDisplay(status: AgentSessionStatus): {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  switch (status) {
    case 'running':
      return {
        icon: Loader2,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
        label: 'Running',
      };
    case 'completed':
      return {
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
        label: 'Completed',
      };
    case 'failed':
      return {
        icon: XCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/20',
        label: 'Failed',
      };
    case 'paused':
      return {
        icon: Pause,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
        label: 'Paused',
      };
    case 'cancelled':
      return {
        icon: Ban,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/20',
        label: 'Cancelled',
      };
    default: {
      // exhaustive check — should never be reached
      const _exhaustiveCheck: never = status;
      return {
        icon: Bot,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/20',
        label: String(_exhaustiveCheck),
      };
    }
  }
}

export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({ session, className }) => {
  const display = getStatusDisplay(session.status);
  const StatusIcon = display.icon;
  const isRunning = session.status === 'running';

  // Live elapsed time counter for running agents
  const [elapsed, setElapsed] = useState(formatElapsedTime(session.startedAt, session.completedAt));

  useEffect(() => {
    if (!isRunning) {
      setElapsed(formatElapsedTime(session.startedAt, session.completedAt));
      return;
    }

    // Update every second while running
    const timer = setInterval(() => {
      setElapsed(formatElapsedTime(session.startedAt, null));
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, session.startedAt, session.completedAt]);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border p-4',
        'bg-white/[0.03] backdrop-blur-xl',
        'transition-all duration-200 hover:bg-white/[0.05]',
        display.borderColor,
        className,
      )}
    >
      {/* Header row: icon + name + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
              display.bgColor,
            )}
          >
            <Bot className={cn('h-4.5 w-4.5', display.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.name}</p>
            {session.model && (
              <p className="truncate text-xs text-muted-foreground/50">{session.model}</p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            display.bgColor,
            display.color,
          )}
        >
          <StatusIcon className={cn('h-3 w-3', isRunning && 'animate-spin')} />
          <span>{display.label}</span>
        </div>
      </div>

      {/* Current action */}
      {session.currentAction && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
          <Wrench className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{session.currentAction}</span>
        </div>
      )}

      {/* Progress bar (if progress is known) */}
      {session.progress !== null && session.progress !== undefined && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground/60">Progress</span>
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {Math.round(session.progress)}%
            </span>
          </div>
          <Progress
            value={session.progress}
            className="h-1.5 bg-white/[0.06]"
            aria-label={`Agent progress: ${Math.round(session.progress)}%`}
          />
        </div>
      )}

      {/* Footer: elapsed time + iteration count + tool calls */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground/50">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{elapsed}</span>
        </div>

        {session.iterationCount !== undefined && (
          <div className="flex items-center gap-1">
            <span>
              Iter {session.iterationCount}
              {session.maxIterations ? `/${session.maxIterations}` : ''}
            </span>
          </div>
        )}

        {session.toolCallCount !== undefined && session.toolCallCount > 0 && (
          <div className="flex items-center gap-1">
            <Wrench className="h-3 w-3" />
            <span>
              {session.toolCallCount} tool{session.toolCallCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      {/* Error message */}
      {session.error && (
        <div className="mt-2 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
          {session.error}
        </div>
      )}
    </div>
  );
};

export default AgentStatusCard;
