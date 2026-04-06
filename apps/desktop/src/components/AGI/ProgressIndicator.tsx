import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Clock,
  Check,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useAgentTaskStore,
  type AgentTask,
  type AgentTaskLiveStep,
} from '../../stores/agentTaskStore';
import { Button } from '../ui/Button';

interface StepData {
  id: string;
  index: number;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  executionTimeMs?: number;
  error?: string;
}

interface GoalData {
  goalId: string;
  description: string;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  steps: StepData[];
  startTime: number;
}

export interface ProgressIndicatorProps {
  className?: string;
  compact?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
}

function hasLiveState(
  liveSteps: AgentTaskLiveStep[] | undefined,
  liveProgress: { step: number; total: number } | undefined,
): boolean {
  return Boolean((liveSteps && liveSteps.length > 0) || liveProgress);
}

function shouldShowGoal(
  task: AgentTask,
  liveSteps: AgentTaskLiveStep[] | undefined,
  liveProgress: { step: number; total: number } | undefined,
): boolean {
  if (task.status === 'pending' || task.status === 'running' || task.status === 'paused') {
    return true;
  }

  return hasLiveState(liveSteps, liveProgress);
}

function mapGoalStatus(task: AgentTask): GoalData['status'] {
  switch (task.status) {
    case 'pending':
      return 'planning';
    case 'running':
    case 'paused':
    case 'recovering':
      return 'executing';
    case 'completed':
      return 'completed';
    default:
      return 'failed';
  }
}

function mapStepStatus(step: AgentTaskLiveStep['status']): StepData['status'] {
  switch (step) {
    case 'running':
      return 'in-progress';
    case 'done':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function buildGoalSteps(
  liveSteps: AgentTaskLiveStep[] | undefined,
  liveProgress: { step: number; total: number } | undefined,
): StepData[] {
  const sortedLiveSteps = [...(liveSteps ?? [])].sort((left, right) => left.index - right.index);
  const liveStepByIndex = new Map(sortedLiveSteps.map((step) => [step.index, step]));
  const totalSteps = Math.max(liveProgress?.total ?? 0, sortedLiveSteps.length);

  if (totalSteps === 0) {
    return [];
  }

  return Array.from({ length: totalSteps }, (_, index) => {
    const liveStep = liveStepByIndex.get(index);
    if (!liveStep) {
      return {
        id: `step_${index}`,
        index,
        description: 'Loading...',
        status: 'pending',
      };
    }

    return {
      id: liveStep.id,
      index,
      description: liveStep.description,
      status: mapStepStatus(liveStep.status),
      startTime: liveStep.startedAt?.getTime(),
      endTime: liveStep.completedAt?.getTime(),
      executionTimeMs: liveStep.executionTimeMs,
      error: liveStep.error,
    };
  });
}

function buildGoalData(
  task: AgentTask,
  liveSteps: AgentTaskLiveStep[] | undefined,
  liveProgress: { step: number; total: number } | undefined,
): GoalData {
  const steps = buildGoalSteps(liveSteps, liveProgress);
  const totalSteps = Math.max(liveProgress?.total ?? 0, steps.length);
  const completedSteps =
    task.status === 'completed'
      ? totalSteps || task.iterations || 0
      : (liveProgress?.step ?? task.iterations ?? 0);
  const progressPercent =
    task.status === 'completed'
      ? 100
      : totalSteps > 0
        ? Math.min(100, Math.round((completedSteps / totalSteps) * 100))
        : 0;

  return {
    goalId: task.id,
    description: task.goal,
    totalSteps,
    completedSteps,
    progressPercent,
    status: mapGoalStatus(task),
    steps,
    startTime: new Date(task.createdAt).getTime(),
  };
}

function sortGoals(left: GoalData, right: GoalData): number {
  const order: Record<GoalData['status'], number> = {
    executing: 0,
    planning: 1,
    failed: 2,
    completed: 3,
  };
  if (order[left.status] !== order[right.status]) {
    return order[left.status] - order[right.status];
  }
  return right.startTime - left.startTime;
}

export function ProgressIndicator({
  className,
  compact = false,
  autoHide = true,
  autoHideDelay = 3000,
}: ProgressIndicatorProps) {
  const tasks = useAgentTaskStore((state) => state.tasks);
  const liveStepsByTask = useAgentTaskStore((state) => state.liveStepsByTask);
  const liveProgressByTask = useAgentTaskStore((state) => state.liveProgressByTask);

  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [hiddenGoals, setHiddenGoals] = useState<Set<string>>(new Set());
  const autoHideTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const allGoals = useMemo(() => {
    return tasks
      .filter((task) => shouldShowGoal(task, liveStepsByTask[task.id], liveProgressByTask[task.id]))
      .map((task) => buildGoalData(task, liveStepsByTask[task.id], liveProgressByTask[task.id]))
      .sort(sortGoals);
  }, [tasks, liveStepsByTask, liveProgressByTask]);

  useEffect(() => {
    if (allGoals.length === 0) {
      return;
    }

    setExpandedGoals((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const goal of allGoals) {
        if (!next.has(goal.goalId)) {
          next.add(goal.goalId);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [allGoals]);

  useEffect(() => {
    const timers = autoHideTimersRef.current;

    for (const [goalId, timeoutId] of timers.entries()) {
      const goal = allGoals.find((entry) => entry.goalId === goalId);
      if (!goal || goal.status !== 'completed' || hiddenGoals.has(goalId) || !autoHide) {
        clearTimeout(timeoutId);
        timers.delete(goalId);
      }
    }

    if (autoHide) {
      for (const goal of allGoals) {
        if (
          goal.status !== 'completed' ||
          hiddenGoals.has(goal.goalId) ||
          timers.has(goal.goalId)
        ) {
          continue;
        }

        const timeoutId = setTimeout(() => {
          setHiddenGoals((previous) => new Set([...previous, goal.goalId]));
          autoHideTimersRef.current.delete(goal.goalId);
        }, autoHideDelay);
        timers.set(goal.goalId, timeoutId);
      }
    }
  }, [allGoals, hiddenGoals, autoHide, autoHideDelay]);

  useEffect(() => {
    const timers = autoHideTimersRef.current;
    return () => {
      for (const timeoutId of timers.values()) {
        clearTimeout(timeoutId);
      }
      timers.clear();
    };
  }, []);

  const visibleGoals = useMemo(() => {
    return allGoals.filter((goal) => !hiddenGoals.has(goal.goalId));
  }, [allGoals, hiddenGoals]);

  const toggleGoalExpansion = (goalId: string) => {
    setExpandedGoals((previous) => {
      const next = new Set(previous);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  const dismissGoal = (goalId: string) => {
    const existingTimeout = autoHideTimersRef.current.get(goalId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      autoHideTimersRef.current.delete(goalId);
    }
    setHiddenGoals((previous) => new Set([...previous, goalId]));
  };

  if (visibleGoals.length === 0) {
    return null;
  }

  if (compact) {
    const activeGoal = visibleGoals[0];
    if (!activeGoal) {
      return null;
    }

    const statusConfig = getStatusConfig(activeGoal.status);
    const StatusIcon = statusConfig.icon;

    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <StatusIcon className={cn('h-4 w-4', statusConfig.iconColor, statusConfig.animate)} />
        <span className="font-medium">{statusConfig.label}</span>
        {activeGoal.status === 'executing' && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{activeGoal.progressPercent}%</span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full transition-all duration-300', statusConfig.progressColor)}
                style={{ width: `${activeGoal.progressPercent}%` }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {visibleGoals.map((goal) => {
        const isExpanded = expandedGoals.has(goal.goalId);
        const statusConfig = getStatusConfig(goal.status);
        const StatusIcon = statusConfig.icon;

        return (
          <div
            key={goal.goalId}
            className={cn(
              'rounded-lg border border-border bg-card transition-all',
              statusConfig.borderColor,
            )}
          >
            <div className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  statusConfig.bgColor,
                )}
              >
                <StatusIcon
                  className={cn('h-4 w-4', statusConfig.iconColor, statusConfig.animate)}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-foreground">{statusConfig.label}</h4>
                  {goal.status === 'executing' && (
                    <span className="text-xs text-muted-foreground">{goal.progressPercent}%</span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                  {goal.description}
                </p>
              </div>

              <div className="flex items-center gap-1">
                {goal.status === 'completed' && (
                  <Button size="sm" variant="ghost" onClick={() => dismissGoal(goal.goalId)}>
                    Dismiss
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleGoalExpansion(goal.goalId)}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {goal.status === 'executing' && (
              <div className="px-4 pb-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full transition-all duration-300', statusConfig.progressColor)}
                    style={{ width: `${goal.progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {isExpanded && goal.steps.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="space-y-2">
                  {goal.steps.map((step, index) => {
                    const stepConfig = getStepStatusConfig(step.status);
                    const StepIcon = stepConfig.icon;
                    const isLastStep = index === goal.steps.length - 1;

                    return (
                      <div key={step.id} className="relative flex gap-3">
                        {!isLastStep && (
                          <div className="absolute left-3 top-6 h-full w-0.5 bg-border" />
                        )}

                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full',
                              stepConfig.bgColor,
                            )}
                          >
                            <StepIcon
                              className={cn('h-3 w-3', stepConfig.iconColor, stepConfig.animate)}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn('text-sm', stepConfig.textColor)}>
                              {step.description}
                            </p>
                            {step.executionTimeMs !== undefined && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {step.executionTimeMs}ms
                              </span>
                            )}
                          </div>
                          {step.error && (
                            <p className="mt-1 text-xs text-destructive">{step.error}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getStatusConfig(status: GoalData['status']) {
  switch (status) {
    case 'planning':
      return {
        icon: Brain,
        label: 'Planning approach',
        bgColor: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
        borderColor: 'border-blue-500/20',
        progressColor: 'bg-blue-500',
        animate: 'animate-pulse',
      };
    case 'executing':
      return {
        icon: Zap,
        label: 'Executing goal',
        bgColor: 'bg-primary/10',
        iconColor: 'text-primary',
        borderColor: 'border-primary/20',
        progressColor: 'bg-primary',
        animate: 'animate-pulse',
      };
    case 'completed':
      return {
        icon: CheckCircle2,
        label: 'Goal achieved',
        bgColor: 'bg-success/10',
        iconColor: 'text-success',
        borderColor: 'border-success/20',
        progressColor: 'bg-success',
        animate: '',
      };
    case 'failed':
      return {
        icon: XCircle,
        label: 'Goal failed',
        bgColor: 'bg-destructive/10',
        iconColor: 'text-destructive',
        borderColor: 'border-destructive/20',
        progressColor: 'bg-destructive',
        animate: '',
      };
  }
}

function getStepStatusConfig(status: StepData['status']) {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        bgColor: 'bg-muted',
        iconColor: 'text-muted-foreground',
        textColor: 'text-muted-foreground',
        animate: '',
      };
    case 'in-progress':
      return {
        icon: Loader2,
        bgColor: 'bg-primary/10',
        iconColor: 'text-primary',
        textColor: 'text-foreground',
        animate: 'animate-spin',
      };
    case 'completed':
      return {
        icon: Check,
        bgColor: 'bg-success/10',
        iconColor: 'text-success',
        textColor: 'text-foreground',
        animate: '',
      };
    case 'failed':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-destructive/10',
        iconColor: 'text-destructive',
        textColor: 'text-foreground',
        animate: '',
      };
  }
}

export default ProgressIndicator;
