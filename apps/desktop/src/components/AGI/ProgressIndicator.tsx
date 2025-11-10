/**
 * AGI Progress Indicator Component
 *
 * Real-time visualization of AGI goal execution progress.
 * Shows step-by-step timeline with status indicators.
 * Similar to loading states in Cursor and Claude Code.
 */

import { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
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

export function ProgressIndicator({
  className,
  compact = false,
  autoHide = true,
  autoHideDelay = 3000,
}: ProgressIndicatorProps) {
  const [activeGoals, setActiveGoals] = useState<Map<string, GoalData>>(new Map());
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [hiddenGoals, setHiddenGoals] = useState<Set<string>>(new Set());

  // Initialize event listeners
  useEffect(() => {
    const unlistenPromises: Promise<() => void>[] = [];

    // Goal submitted
    unlistenPromises.push(
      listen<{ goal_id: string; description: string }>('agi:goal:submitted', ({ payload }) => {
        setActiveGoals((prev) => {
          const newMap = new Map(prev);
          newMap.set(payload.goal_id, {
            goalId: payload.goal_id,
            description: payload.description,
            totalSteps: 0,
            completedSteps: 0,
            progressPercent: 0,
            status: 'planning',
            steps: [],
            startTime: Date.now(),
          });
          return newMap;
        });

        // Auto-expand new goals
        setExpandedGoals((prev) => new Set([...prev, payload.goal_id]));
      }),
    );

    // Plan created
    unlistenPromises.push(
      listen<{ goal_id: string; total_steps: number; estimated_duration_ms: number }>(
        'agi:goal:plan_created',
        ({ payload }) => {
          setActiveGoals((prev) => {
            const newMap = new Map(prev);
            const goal = newMap.get(payload.goal_id);
            if (goal) {
              goal.totalSteps = payload.total_steps;
              goal.status = 'executing';
              // Initialize steps as pending
              goal.steps = Array.from({ length: payload.total_steps }, (_, i) => ({
                id: `step_${i}`,
                index: i,
                description: 'Loading...',
                status: 'pending',
              }));
            }
            return newMap;
          });
        },
      ),
    );

    // Step started
    unlistenPromises.push(
      listen<{
        goal_id: string;
        step_id: string;
        step_index: number;
        total_steps: number;
        description: string;
      }>('agi:goal:step_started', ({ payload }) => {
        setActiveGoals((prev) => {
          const newMap = new Map(prev);
          const goal = newMap.get(payload.goal_id);
          if (goal && goal.steps[payload.step_index]) {
            goal.steps[payload.step_index] = {
              id: payload.step_id,
              index: payload.step_index,
              description: payload.description,
              status: 'in-progress',
              startTime: Date.now(),
            };
          }
          return newMap;
        });
      }),
    );

    // Step completed
    unlistenPromises.push(
      listen<{
        goal_id: string;
        step_id: string;
        step_index: number;
        total_steps: number;
        success: boolean;
        execution_time_ms: number;
        error?: string;
      }>('agi:goal:step_completed', ({ payload }) => {
        setActiveGoals((prev) => {
          const newMap = new Map(prev);
          const goal = newMap.get(payload.goal_id);
          if (goal && goal.steps[payload.step_index]) {
            const existingStep = goal.steps[payload.step_index];
            if (existingStep) {
              goal.steps[payload.step_index] = {
                id: existingStep.id,
                index: existingStep.index,
                description: existingStep.description,
                status: payload.success ? 'completed' : 'failed',
                startTime: existingStep.startTime,
                endTime: Date.now(),
                executionTimeMs: payload.execution_time_ms,
                error: payload.error,
              };
            }
          }
          return newMap;
        });
      }),
    );

    // Progress update
    unlistenPromises.push(
      listen<{
        goal_id: string;
        completed_steps: number;
        total_steps: number;
        progress_percent: number;
      }>('agi:goal:progress', ({ payload }) => {
        setActiveGoals((prev) => {
          const newMap = new Map(prev);
          const goal = newMap.get(payload.goal_id);
          if (goal) {
            goal.completedSteps = payload.completed_steps;
            goal.progressPercent = payload.progress_percent;
          }
          return newMap;
        });
      }),
    );

    // Goal achieved
    unlistenPromises.push(
      listen<{ goal_id: string; total_steps: number; completed_steps: number }>(
        'agi:goal:achieved',
        ({ payload }) => {
          setActiveGoals((prev) => {
            const newMap = new Map(prev);
            const goal = newMap.get(payload.goal_id);
            if (goal) {
              goal.status = 'completed';
              goal.completedSteps = payload.completed_steps;
              goal.progressPercent = 100;
            }
            return newMap;
          });

          // Auto-hide after delay
          if (autoHide) {
            setTimeout(() => {
              setHiddenGoals((prev) => new Set([...prev, payload.goal_id]));
            }, autoHideDelay);
          }
        },
      ),
    );

    // Cleanup
    return () => {
      void Promise.all(unlistenPromises).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, [autoHide, autoHideDelay]);

  // Get visible goals
  const visibleGoals = useMemo(() => {
    return Array.from(activeGoals.values()).filter((goal) => !hiddenGoals.has(goal.goalId));
  }, [activeGoals, hiddenGoals]);

  // Toggle goal expansion
  const toggleGoalExpansion = (goalId: string) => {
    setExpandedGoals((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(goalId)) {
        newSet.delete(goalId);
      } else {
        newSet.add(goalId);
      }
      return newSet;
    });
  };

  // Dismiss goal
  const dismissGoal = (goalId: string) => {
    setHiddenGoals((prev) => new Set([...prev, goalId]));
  };

  if (visibleGoals.length === 0) {
    return null;
  }

  // Compact mode - show minimal inline progress
  if (compact && visibleGoals.length > 0) {
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
            {/* Header */}
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
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
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

            {/* Progress Bar */}
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

            {/* Steps Timeline */}
            {isExpanded && goal.steps.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="space-y-2">
                  {goal.steps.map((step, index) => {
                    const stepConfig = getStepStatusConfig(step.status);
                    const StepIcon = stepConfig.icon;
                    const isLastStep = index === goal.steps.length - 1;

                    return (
                      <div key={step.id} className="relative flex gap-3">
                        {/* Timeline Line */}
                        {!isLastStep && (
                          <div className="absolute left-3 top-6 h-full w-0.5 bg-border" />
                        )}

                        {/* Step Icon */}
                        <div className="relative flex-shrink-0">
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

                        {/* Step Content */}
                        <div className="min-w-0 flex-1 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn('text-sm', stepConfig.textColor)}>
                              {step.description}
                            </p>
                            {step.executionTimeMs !== undefined && (
                              <span className="flex-shrink-0 text-xs text-muted-foreground">
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

// Helper functions
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
