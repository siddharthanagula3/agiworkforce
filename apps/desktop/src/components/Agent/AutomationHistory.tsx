import { useState, useMemo } from 'react';
import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import {
  useExecutionStore,
  type ExecutionStep,
  type ActiveGoal,
} from '../../stores/executionStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';

interface AutomationHistoryProps {
  className?: string;
}

interface AutomationRun {
  id: string;
  goal: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  steps: AutomationStep[];
  error?: string;
}

interface AutomationStep {
  id: string;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
  duration_ms?: number;
  details?: string;
}

const STATUS_ICONS = {
  running: Play,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: AlertTriangle,
  pending: Clock,
};

const STATUS_COLORS = {
  running: 'text-blue-500 bg-blue-500/10',
  completed: 'text-green-500 bg-green-500/10',
  failed: 'text-red-500 bg-red-500/10',
  cancelled: 'text-yellow-500 bg-yellow-500/10',
  pending: 'text-muted-foreground bg-muted',
};

// Map execution store step status to our display status
function mapStepStatus(status: string): AutomationStep['status'] {
  switch (status) {
    case 'in-progress':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
}

// Map execution store goal status to our display status
function mapGoalStatus(status: ActiveGoal['status']): AutomationRun['status'] {
  switch (status) {
    case 'executing':
    case 'planning':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'completed';
  }
}

export function AutomationHistory({ className }: AutomationHistoryProps) {
  const { activeGoal, steps } = useExecutionStore();
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Transform current execution into AutomationRun format
  const runs: AutomationRun[] = useMemo(() => {
    if (!activeGoal) {
      return [];
    }

    const transformedSteps: AutomationStep[] = steps.map((step: ExecutionStep) => ({
      id: step.id,
      action: step.description,
      status: mapStepStatus(step.status),
      timestamp: new Date(step.startTime || Date.now()),
      duration_ms: step.executionTimeMs,
      details: step.error || step.llmReasoning?.slice(0, 100),
    }));

    const run: AutomationRun = {
      id: activeGoal.id,
      goal: activeGoal.description,
      status: mapGoalStatus(activeGoal.status),
      startedAt: new Date(activeGoal.startTime),
      completedAt: activeGoal.endTime ? new Date(activeGoal.endTime) : undefined,
      steps: transformedSteps,
    };

    return [run];
  }, [activeGoal, steps]);

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Give visual feedback
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (runs.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground',
          className,
        )}
      >
        <Clock className="h-10 w-10 opacity-70" />
        <div className="max-w-lg space-y-2">
          <p className="text-lg font-semibold text-foreground">No automation history yet</p>
          <p className="text-sm">
            Your automation runs will appear here with step-by-step transcripts, execution times,
            and status events. Start a new automation to see it tracked here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Automation History</span>
          <Badge variant="secondary">{runs.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Runs List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {runs.map((run) => {
            const isExpanded = expandedRuns.has(run.id);
            const StatusIcon = STATUS_ICONS[run.status];
            const isActive = activeGoal?.id === run.id && run.status === 'running';

            return (
              <div key={run.id} className={cn('group', isActive && 'bg-primary/5')}>
                {/* Run Header */}
                <button type="button"
                  onClick={() => toggleExpanded(run.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="mt-0.5">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className={cn('p-1.5 rounded-lg', STATUS_COLORS[run.status])}>
                    <StatusIcon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{run.goal}</span>
                      {isActive && (
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatTime(run.startedAt)}</span>
                      {run.completedAt && (
                        <span>
                          Duration:{' '}
                          {formatDuration(
                            new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
                          )}
                        </span>
                      )}
                      <span>{run.steps.length} steps</span>
                    </div>
                  </div>
                </button>

                {/* Expanded Steps */}
                {isExpanded && (
                  <div className="px-4 pb-3 pl-12">
                    <div className="border-l-2 border-border pl-4 space-y-2">
                      {run.steps.map((step) => {
                        const StepIcon = STATUS_ICONS[step.status];
                        return (
                          <div key={step.id} className="flex items-start gap-2 py-1">
                            <div className={cn('p-1 rounded', STATUS_COLORS[step.status])}>
                              <StepIcon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">{step.action}</span>
                                {step.duration_ms !== undefined && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatDuration(step.duration_ms)}
                                  </span>
                                )}
                              </div>
                              {step.details && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {step.details}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {run.error && (
                      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs text-red-600">{run.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
