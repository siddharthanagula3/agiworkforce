'use client';

import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Card, CardContent } from '@shared/ui/card';
import { Switch } from '@shared/ui/switch';
import {
  Clock,
  Play,
  History,
  Pencil,
  Trash2,
  ChevronUp,
  Copy,
  TrendingUp,
} from 'lucide-react';
import {
  formatDate,
  getNextRunCountdown,
  recurrenceLabel,
} from '../types';
import type { Schedule, ScheduleRun } from '../types';
import { ScheduleRunHistory } from './ScheduleRunHistory';

// ---------------------------------------------------------------------------
// Status badge helper (kept local since it renders JSX)
// ---------------------------------------------------------------------------

function statusBadge(status: string | null) {
  if (!status) return null;
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    success: 'default',
    pending: 'secondary',
    running: 'secondary',
    failed: 'destructive',
    error: 'destructive',
  };
  return (
    <Badge variant={variants[status] || 'outline'} className="text-xs capitalize">
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Success rate helper
// ---------------------------------------------------------------------------

function successRateBadge(runs: ScheduleRun[] | undefined) {
  if (!runs || runs.length === 0) return null;
  const successes = runs.filter((r) => r.status === 'success').length;
  const rate = Math.round((successes / runs.length) * 100);
  const variant = rate >= 90 ? 'default' : rate >= 60 ? 'secondary' : 'destructive';
  return (
    <Badge variant={variant} className="flex items-center gap-1 text-xs">
      <TrendingUp className="h-3 w-3" />
      {rate}%
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleCardProps {
  schedule: Schedule;
  isHistoryExpanded: boolean;
  historyRuns: ScheduleRun[];
  historyLoading: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onTriggerRun: (id: string) => void;
  onToggleHistory: (id: string) => void;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
  onDuplicate: (schedule: Schedule) => void;
  onRerun: (scheduleId: string, run: ScheduleRun) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleCard({
  schedule,
  isHistoryExpanded,
  historyRuns,
  historyLoading,
  onToggleActive,
  onTriggerRun,
  onToggleHistory,
  onEdit,
  onDelete,
  onDuplicate,
  onRerun,
}: ScheduleCardProps) {
  const countdown = getNextRunCountdown(schedule.nextRunAt);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: info */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="truncate text-sm font-semibold">{schedule.name}</h3>
              <Badge variant="outline" className="text-xs">
                {recurrenceLabel(schedule.recurrence)}
              </Badge>
              {statusBadge(schedule.lastRunStatus)}
              {successRateBadge(historyRuns.length > 0 ? historyRuns : undefined)}
            </div>

            <p className="line-clamp-2 text-xs text-muted-foreground">{schedule.prompt}</p>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                {schedule.timeOfDay} {schedule.timezone}
              </span>
              {schedule.lastRunAt && (
                <span>Last run: {formatDate(schedule.lastRunAt)}</span>
              )}
              {countdown && schedule.isActive && (
                <span className="text-primary/70">Next: {countdown}</span>
              )}
              {schedule.model && schedule.model !== 'auto-balanced' && (
                <span>Model: {schedule.model}</span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch
              checked={schedule.isActive}
              onCheckedChange={(checked) => onToggleActive(schedule.id, checked)}
              aria-label={`Toggle ${schedule.name}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onTriggerRun(schedule.id)}
              title="Run now"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleHistory(schedule.id)}
              title="Run history"
            >
              {isHistoryExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <History className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDuplicate(schedule)}
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(schedule)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(schedule.id)}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Run history panel */}
        {isHistoryExpanded && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <ScheduleRunHistory
              scheduleId={schedule.id}
              runs={historyRuns}
              loading={historyLoading}
              onRerun={(run) => onRerun(schedule.id, run)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduleCard;
