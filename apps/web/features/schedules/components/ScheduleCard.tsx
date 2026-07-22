'use client';

import { Badge, Button, Card, CardContent, Switch } from '@agiworkforce/ui';
import { CalendarClock, History, Pencil, Play, Trash2 } from 'lucide-react';
import type { ScheduleTask } from '../types';
import { DAYS_OF_WEEK, formatDateTime, recurrenceLabel, taskRecurrence } from '../types';
import { ScheduleRunHistory, type ScheduleHistoryState } from './ScheduleRunHistory';

export type ScheduleOperation = 'toggle' | 'run' | 'delete' | null;

interface ScheduleCardProps {
  schedule: ScheduleTask;
  operation: ScheduleOperation;
  error: string | null;
  historyExpanded: boolean;
  history: ScheduleHistoryState;
  onToggleEnabled: (schedule: ScheduleTask) => void;
  onRunNow: (schedule: ScheduleTask) => void;
  onEdit: (schedule: ScheduleTask) => void;
  onDelete: (schedule: ScheduleTask) => void;
  onToggleHistory: (schedule: ScheduleTask) => void;
  onRetryHistory: (schedule: ScheduleTask) => void;
  onLoadMoreHistory: (schedule: ScheduleTask) => void;
}

const TERMINAL_STATUSES = new Set<ScheduleTask['status']>(['completed', 'expired']);

function scheduleTiming(schedule: ScheduleTask): string {
  const recurrence = taskRecurrence(schedule);
  const metadata = schedule.metadata ?? {};
  const time = typeof metadata['timeOfDay'] === 'string' ? metadata['timeOfDay'] : null;
  if (recurrence === 'once') return formatDateTime(schedule.executeAt, schedule.timezone);
  if (recurrence === 'interval' && schedule.intervalMs) {
    const minutes = schedule.intervalMs / 60_000;
    if (minutes % 1_440 === 0) return `Every ${minutes / 1_440} day${minutes === 1_440 ? '' : 's'}`;
    if (minutes % 60 === 0) return `Every ${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
    return `Every ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (recurrence === 'custom') return schedule.cronExpression ?? 'Invalid cron';
  if (recurrence === 'weekly') {
    const days = Array.isArray(metadata['daysOfWeek'])
      ? metadata['daysOfWeek']
          .filter((day): day is number => typeof day === 'number')
          .map((day) => DAYS_OF_WEEK.find((candidate) => candidate.value === day)?.label)
          .filter(Boolean)
          .join(', ')
      : '';
    return `${days || 'Weekly'} at ${time ?? 'unknown time'}`;
  }
  if (recurrence === 'monthly') {
    return `Day ${String(metadata['dayOfMonth'] ?? '?')} at ${time ?? 'unknown time'}`;
  }
  return `Every day at ${time ?? 'unknown time'}`;
}

function statusVariant(status: ScheduleTask['status']) {
  if (status === 'failed' || status === 'expired') return 'destructive' as const;
  if (status === 'active') return 'default' as const;
  return 'secondary' as const;
}

export function ScheduleCard({
  schedule,
  operation,
  error,
  historyExpanded,
  history,
  onToggleEnabled,
  onRunNow,
  onEdit,
  onDelete,
  onToggleHistory,
  onRetryHistory,
  onLoadMoreHistory,
}: ScheduleCardProps) {
  const terminal = TERMINAL_STATUSES.has(schedule.status);
  const supported = schedule.actionType === 'agent';
  const canRun = supported && schedule.isEnabled && schedule.status === 'active' && !operation;
  const canEdit = supported && !terminal && !operation;
  const canToggle = !terminal && (!schedule.isEnabled ? supported : true) && !operation;
  const headingId = `schedule-title-${schedule.id}`;

  return (
    <Card
      as="article"
      aria-labelledby={headingId}
      className="overflow-hidden border-border/80 bg-card shadow-sm"
    >
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <h2
                id={headingId}
                className="min-w-0 break-words text-base font-semibold text-foreground"
              >
                {schedule.name}
              </h2>
              <Badge variant={statusVariant(schedule.status)} className="capitalize">
                {schedule.status}
              </Badge>
              <Badge variant="outline">{recurrenceLabel(taskRecurrence(schedule))}</Badge>
              {!supported && <Badge variant="destructive">Unsupported action type</Badge>}
            </div>

            {schedule.description && (
              <p className="break-words text-sm text-muted-foreground">{schedule.description}</p>
            )}
            <p className="line-clamp-3 break-words text-sm leading-relaxed text-foreground/85">
              {schedule.prompt || 'No task instructions are stored.'}
            </p>

            <dl className="grid gap-x-6 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Timing</dt>
                <dd className="break-words font-mono">{scheduleTiming(schedule)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Time Zone</dt>
                <dd className="break-words font-mono" translate="no">
                  {schedule.timezone}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Next Run</dt>
                <dd>
                  {schedule.isEnabled
                    ? formatDateTime(schedule.nextExecutionAt, schedule.timezone)
                    : 'Paused'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Last Run</dt>
                <dd>{formatDateTime(schedule.lastExecutedAt, schedule.timezone)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Runs</dt>
                <dd className="tabular-nums">
                  {new Intl.NumberFormat().format(schedule.executionCount)}
                  {schedule.maxExecutions === null
                    ? ''
                    : ` of ${new Intl.NumberFormat().format(schedule.maxExecutions)}`}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-foreground/70">Model</dt>
                <dd className="break-words font-mono" translate="no">
                  {schedule.model ?? 'auto'}
                </dd>
              </div>
            </dl>

            {schedule.lastError && (
              <p className="break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Last run: {schedule.lastError}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="break-words rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error} Retry the action when ready.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Switch
              checked={schedule.isEnabled}
              onCheckedChange={() => onToggleEnabled(schedule)}
              disabled={!canToggle}
              aria-label={`${schedule.isEnabled ? 'Pause' : 'Resume'} ${schedule.name}`}
              aria-busy={operation === 'toggle'}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onRunNow(schedule)}
              disabled={!canRun}
              aria-label={`Run ${schedule.name} Now`}
              title="Run Now"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onToggleHistory(schedule)}
              aria-expanded={historyExpanded}
              aria-controls={`schedule-history-${schedule.id}`}
              aria-label={`${historyExpanded ? 'Hide' : 'View'} History for ${schedule.name}`}
              title="Run History"
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onEdit(schedule)}
              disabled={!canEdit}
              aria-label={`Edit ${schedule.name}`}
              title="Edit Schedule"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onDelete(schedule)}
              disabled={operation !== null}
              aria-label={`Delete ${schedule.name}`}
              title="Delete Schedule"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            {operation && <span className="sr-only">Schedule action in progress…</span>}
          </div>
        </div>

        {historyExpanded && (
          <section
            id={`schedule-history-${schedule.id}`}
            aria-label={`Run History for ${schedule.name}`}
            className="border-t border-border/70 bg-muted/20 p-5"
          >
            <h3 className="mb-3 text-sm font-semibold text-foreground">Run History</h3>
            <ScheduleRunHistory
              state={history}
              timezone={schedule.timezone}
              onRetry={() => onRetryHistory(schedule)}
              onLoadMore={() => onLoadMoreHistory(schedule)}
            />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduleCard;
