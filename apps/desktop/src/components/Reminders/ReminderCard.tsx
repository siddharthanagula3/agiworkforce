/**
 * ReminderCard Component
 *
 * Displays a single reminder or scheduled task with status indicators
 * and action controls for pause/resume, edit, and delete operations.
 */
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';
import {
  Bell,
  Calendar,
  Clock,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ScheduledJob } from '@/stores/schedulerStore';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';

interface ReminderCardProps {
  job: ScheduledJob;
  onPause: (jobId: string) => Promise<void>;
  onResume: (jobId: string) => Promise<void>;
  onEdit: (job: ScheduledJob) => void;
  onDelete: (jobId: string) => Promise<void>;
}

/**
 * Returns a human-readable description of the schedule.
 */
function getScheduleDescription(job: ScheduledJob): string {
  if (job.schedule_type === 'once' && job.run_at) {
    const runDate = parseISO(job.run_at);
    if (isPast(runDate)) {
      return 'Already ran';
    }
    return `Once on ${format(runDate, 'MMM d, yyyy')} at ${format(runDate, 'h:mm a')}`;
  }

  if (job.schedule_type === 'interval' && job.interval_seconds) {
    const seconds = job.interval_seconds;
    if (seconds < 60) {
      return `Every ${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `Every ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `Every ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(seconds / 86400);
    return `Every ${days} day${days !== 1 ? 's' : ''}`;
  }

  if (job.schedule_type === 'cron' && job.cron_expression) {
    // Parse common cron patterns for user-friendly display
    const cron = job.cron_expression;

    // Daily at specific time
    const dailyMatch = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
    if (dailyMatch && dailyMatch[1] && dailyMatch[2]) {
      const minute = dailyMatch[1];
      const hour = dailyMatch[2];
      const time = new Date();
      time.setHours(parseInt(hour, 10), parseInt(minute, 10));
      return `Daily at ${format(time, 'h:mm a')}`;
    }

    // Weekly
    const weeklyMatch = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+(\d)$/);
    if (weeklyMatch && weeklyMatch[1] && weeklyMatch[2] && weeklyMatch[3]) {
      const minute = weeklyMatch[1];
      const hour = weeklyMatch[2];
      const dayOfWeek = weeklyMatch[3];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const time = new Date();
      time.setHours(parseInt(hour, 10), parseInt(minute, 10));
      return `Every ${days[parseInt(dayOfWeek, 10)]} at ${format(time, 'h:mm a')}`;
    }

    // Hourly
    if (cron.match(/^(\d+)\s+\*\s+\*\s+\*\s+\*$/)) {
      return 'Every hour';
    }

    return `Cron: ${cron}`;
  }

  return 'Custom schedule';
}

/**
 * Returns the appropriate icon for the action type.
 */
function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'reminder':
      return Bell;
    case 'briefing':
      return Calendar;
    case 'agent_task':
      return RefreshCw;
    default:
      return Clock;
  }
}

/**
 * Returns a badge variant based on the action type.
 */
function getActionBadgeVariant(actionType: string): 'default' | 'secondary' | 'outline' {
  switch (actionType) {
    case 'reminder':
      return 'default';
    case 'briefing':
      return 'secondary';
    case 'agent_task':
      return 'outline';
    default:
      return 'outline';
  }
}

export function ReminderCard({ job, onPause, onResume, onEdit, onDelete }: ReminderCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const ActionIcon = getActionIcon(job.action_type);

  const scheduleDescription = useMemo(() => getScheduleDescription(job), [job]);

  const nextRunDisplay = useMemo(() => {
    if (!job.next_run) return null;
    const nextRun = parseISO(job.next_run);
    if (isPast(nextRun)) {
      return 'Pending...';
    }
    return formatDistanceToNow(nextRun, { addSuffix: true });
  }, [job.next_run]);

  const lastRunDisplay = useMemo(() => {
    if (!job.last_run) return null;
    const lastRun = parseISO(job.last_run);
    return formatDistanceToNow(lastRun, { addSuffix: true });
  }, [job.last_run]);

  const handlePauseResume = async () => {
    setIsLoading(true);
    try {
      if (job.enabled) {
        await onPause(job.id);
      } else {
        await onResume(job.id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await onDelete(job.id);
    } finally {
      setIsLoading(false);
    }
  };

  // Parse action data for display
  let actionMessage = '';
  try {
    const actionData = JSON.parse(job.action_data);
    actionMessage = actionData.message || actionData.prompt || '';
  } catch {
    actionMessage = job.action_data;
  }

  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        !job.enabled && 'opacity-60 bg-muted/30',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left side: Icon and content */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Status indicator and icon */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  job.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <ActionIcon className="h-5 w-5" />
              </div>
              {/* Enabled/disabled indicator dot */}
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                  job.enabled ? 'bg-green-500' : 'bg-gray-400',
                )}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{job.name}</h3>
                <Badge
                  variant={getActionBadgeVariant(job.action_type)}
                  className="shrink-0 text-xs"
                >
                  {job.action_type.replace('_', ' ')}
                </Badge>
              </div>

              {/* Schedule description */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {scheduleDescription}
              </p>

              {/* Action message preview */}
              {actionMessage && (
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {actionMessage}
                </p>
              )}

              {/* Next/Last run info */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {job.enabled && nextRunDisplay && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Next: {nextRunDisplay}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {job.next_run && format(parseISO(job.next_run), 'PPpp')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {lastRunDisplay && (
                  <span className="text-muted-foreground/70">Last: {lastRunDisplay}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Quick toggle button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handlePauseResume}
                    disabled={isLoading}
                  >
                    {job.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{job.enabled ? 'Pause' : 'Resume'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* More options dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(job)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePauseResume}>
                  {job.enabled ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
