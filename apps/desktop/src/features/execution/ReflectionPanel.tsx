/**
 * ReflectionPanel - Shows AI learning, failure analysis, and improvement suggestions
 *
 * This panel surfaces the Reflection Engine's analysis to help non-technical users understand:
 * - Why tasks failed
 * - What the AI learned from failures
 * - Suggested corrections and improvements
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  RefreshCw,
  Target,
  TrendingUp,
  Wrench,
  XCircle,
  CheckCircle,
  HelpCircle,
  GitBranch,
  Clock,
  User,
  Shuffle,
  SkipForward,
  Edit3,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionStore,
  selectReflection,
  selectActiveGoal,
  selectHasReflectionIssues,
} from '../../stores/executionStore';
import type { FailurePattern, Correction, SubGoal } from '../../api/reflection';

export interface ReflectionPanelProps {
  className?: string;
}

export function ReflectionPanel({ className }: ReflectionPanelProps) {
  const activeGoal = useExecutionStore(selectActiveGoal);
  const reflection = useExecutionStore(selectReflection);
  const hasIssues = useExecutionStore(selectHasReflectionIssues);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview', 'patterns', 'corrections']),
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  if (!activeGoal) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <Brain className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No active execution</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI reflections will appear here during task execution
          </p>
        </div>
      </div>
    );
  }

  if (!hasIssues && !reflection.currentInsight) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-green-500/70" />
          <p className="mt-2 text-sm font-medium text-foreground">All Clear</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No issues detected. The AI is executing smoothly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header with overall status */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              reflection.goalAchievable ? 'bg-amber-500/10' : 'bg-destructive/10',
            )}
          >
            {reflection.isReflecting ? (
              <Brain className="h-4 w-4 animate-pulse text-primary" />
            ) : reflection.goalAchievable ? (
              <Lightbulb className="h-4 w-4 text-amber-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {reflection.isReflecting
                ? 'Analyzing execution...'
                : reflection.goalAchievable
                  ? 'Improvements Available'
                  : 'Attention Required'}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Iteration {reflection.iteration}
              {reflection.confidence < 1.0 && (
                <span className="ml-2">Confidence: {Math.round(reflection.confidence * 100)}%</span>
              )}
            </p>
          </div>
          {reflection.currentInsight && (
            <HealthScore
              successRate={reflection.currentInsight.assessment.successRate}
              goalAchievable={reflection.goalAchievable}
            />
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overview Section */}
        {reflection.currentInsight && (
          <CollapsibleSection
            title="Overview"
            icon={TrendingUp}
            isExpanded={expandedSections.has('overview')}
            onToggle={() => toggleSection('overview')}
          >
            <OverviewContent insight={reflection.currentInsight} />
          </CollapsibleSection>
        )}

        {/* Failure Patterns Section */}
        {reflection.failurePatterns.length > 0 && (
          <CollapsibleSection
            title={`Failure Patterns (${reflection.failurePatterns.length})`}
            icon={XCircle}
            isExpanded={expandedSections.has('patterns')}
            onToggle={() => toggleSection('patterns')}
            variant="warning"
          >
            <div className="space-y-2">
              {reflection.failurePatterns.map((pattern) => (
                <FailurePatternCard key={pattern.patternId} pattern={pattern} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Suggested Corrections Section */}
        {reflection.corrections.length > 0 && (
          <CollapsibleSection
            title={`Suggested Corrections (${reflection.corrections.length})`}
            icon={Wrench}
            isExpanded={expandedSections.has('corrections')}
            onToggle={() => toggleSection('corrections')}
            variant="info"
          >
            <div className="space-y-2">
              {reflection.corrections.map((correction, index) => (
                <CorrectionCard key={`${correction.forStepId}-${index}`} correction={correction} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Sub-Goals Section */}
        {reflection.subGoals.length > 0 && (
          <CollapsibleSection
            title={`Sub-Goals (${reflection.subGoals.length})`}
            icon={Target}
            isExpanded={expandedSections.has('subgoals')}
            onToggle={() => toggleSection('subgoals')}
          >
            <div className="space-y-2">
              {reflection.subGoals.map((subGoal) => (
                <SubGoalCard key={subGoal.id} subGoal={subGoal} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recommendations Section */}
        {reflection.recommendations.length > 0 && (
          <CollapsibleSection
            title={`Recommendations (${reflection.recommendations.length})`}
            icon={Lightbulb}
            isExpanded={expandedSections.has('recommendations')}
            onToggle={() => toggleSection('recommendations')}
            variant="success"
          >
            <ul className="space-y-2">
              {reflection.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'info' | 'success';
}

function CollapsibleSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
  variant = 'default',
}: CollapsibleSectionProps) {
  const variantStyles = {
    default: 'border-border',
    warning: 'border-amber-500/30 bg-amber-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
    success: 'border-green-500/30 bg-green-500/5',
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    warning: 'text-amber-500',
    info: 'text-blue-500',
    success: 'text-green-500',
  };

  return (
    <div className={cn('rounded-lg border', variantStyles[variant])}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        <Icon className={cn('h-4 w-4', iconStyles[variant])} />
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180',
          )}
        />
      </button>
      {isExpanded && <div className="border-t border-border/50 px-3 py-2">{children}</div>}
    </div>
  );
}

interface HealthScoreProps {
  successRate: number;
  goalAchievable: boolean;
}

function HealthScore({ successRate, goalAchievable }: HealthScoreProps) {
  const percentage = Math.round(successRate * 100);
  const color =
    percentage >= 75 ? 'text-green-500' : percentage >= 50 ? 'text-amber-500' : 'text-destructive';
  const bgColor =
    percentage >= 75 ? 'bg-green-500' : percentage >= 50 ? 'bg-amber-500' : 'bg-destructive';

  return (
    <div className="text-right">
      <div className={cn('text-lg font-bold', color)}>{percentage}%</div>
      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all duration-300', bgColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {!goalAchievable && <p className="mt-1 text-xs text-destructive">May need help</p>}
    </div>
  );
}

interface OverviewContentProps {
  insight: {
    assessment: {
      successRate: number;
      successfulSteps: string[];
      failedSteps: { stepId: string; description: string; recoverable: boolean }[];
      goalAchievable: boolean;
      progressEstimate: number;
      resourceEfficiency: number;
      timeEfficiency: number;
    };
  };
}

function OverviewContent({ insight }: OverviewContentProps) {
  const { assessment } = insight;
  const successPercent = Math.round(assessment.successRate * 100);
  const progressPercent = Math.round(assessment.progressEstimate * 100);

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Success Rate"
          value={`${successPercent}%`}
          icon={CheckCircle}
          variant={successPercent >= 75 ? 'success' : successPercent >= 50 ? 'warning' : 'error'}
        />
        <StatCard
          label="Progress"
          value={`${progressPercent}%`}
          icon={TrendingUp}
          variant="default"
        />
        <StatCard
          label="Status"
          value={assessment.goalAchievable ? 'Achievable' : 'At Risk'}
          icon={Target}
          variant={assessment.goalAchievable ? 'success' : 'error'}
        />
      </div>

      {/* Failed steps summary */}
      {assessment.failedSteps.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-xs font-medium text-destructive">
              {assessment.failedSteps.length} step(s) failed
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {assessment.failedSteps.slice(0, 3).map((step) => (
              <li
                key={step.stepId}
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <span className="truncate">{step.description}</span>
                {step.recoverable && (
                  <span className="shrink-0 rounded bg-green-500/20 px-1 text-green-600">
                    recoverable
                  </span>
                )}
              </li>
            ))}
            {assessment.failedSteps.length > 3 && (
              <li className="text-xs text-muted-foreground">
                ...and {assessment.failedSteps.length - 3} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'success' | 'warning' | 'error';
}

function StatCard({ label, value, icon: Icon, variant }: StatCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-green-500',
    warning: 'text-amber-500',
    error: 'text-destructive',
  };

  return (
    <div className="rounded-md bg-accent/50 p-2 text-center">
      <Icon className={cn('mx-auto h-4 w-4', variantStyles[variant])} />
      <div className={cn('mt-1 text-sm font-semibold', variantStyles[variant])}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

interface FailurePatternCardProps {
  pattern: FailurePattern;
}

function FailurePatternCard({ pattern }: FailurePatternCardProps) {
  const categoryInfo = getFailureCategoryInfo(pattern.category);

  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
      <div className="flex items-start gap-2">
        <categoryInfo.icon className={cn('mt-0.5 h-4 w-4 shrink-0', categoryInfo.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{categoryInfo.label}</span>
            {pattern.frequency > 1 && (
              <span className="rounded bg-amber-500/20 px-1.5 text-xs text-amber-600">
                {pattern.frequency}x
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{pattern.description}</p>
          {pattern.rootCause && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              Root cause: {pattern.rootCause}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface CorrectionCardProps {
  correction: Correction;
}

function CorrectionCard({ correction }: CorrectionCardProps) {
  const typeInfo = getCorrectionTypeInfo(correction.correctionType);

  return (
    <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2">
      <div className="flex items-start gap-2">
        <typeInfo.icon className={cn('mt-0.5 h-4 w-4 shrink-0', typeInfo.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{typeInfo.label}</span>
            <span className="rounded bg-blue-500/20 px-1.5 text-xs text-blue-600">
              Priority {correction.priority}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{correction.description}</p>
          {correction.alternativeTool && (
            <p className="mt-1 text-xs text-blue-500">
              Suggested tool: {correction.alternativeTool}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface SubGoalCardProps {
  subGoal: SubGoal;
}

function SubGoalCard({ subGoal }: SubGoalCardProps) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{subGoal.description}</p>
          {subGoal.successCriteria.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {subGoal.successCriteria.slice(0, 2).map((criteria, i) => (
                <li key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {criteria}
                </li>
              ))}
            </ul>
          )}
          {subGoal.suggestedTools.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {subGoal.suggestedTools.slice(0, 3).map((tool) => (
                <span
                  key={tool}
                  className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper functions
// ============================================================================

function getFailureCategoryInfo(category: string) {
  const categories: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
    ResourceUnavailable: {
      label: 'Resource Not Found',
      icon: HelpCircle,
      color: 'text-orange-500',
    },
    PermissionDenied: {
      label: 'Permission Denied',
      icon: XCircle,
      color: 'text-red-500',
    },
    InvalidInput: {
      label: 'Invalid Input',
      icon: AlertTriangle,
      color: 'text-yellow-500',
    },
    NetworkError: {
      label: 'Network Error',
      icon: AlertTriangle,
      color: 'text-blue-500',
    },
    Timeout: {
      label: 'Timeout',
      icon: Clock,
      color: 'text-purple-500',
    },
    DependencyFailed: {
      label: 'Dependency Failed',
      icon: GitBranch,
      color: 'text-pink-500',
    },
    ToolError: {
      label: 'Tool Error',
      icon: Wrench,
      color: 'text-red-400',
    },
    StateError: {
      label: 'State Error',
      icon: AlertTriangle,
      color: 'text-amber-500',
    },
    Unknown: {
      label: 'Unknown Error',
      icon: HelpCircle,
      color: 'text-gray-500',
    },
  };

  return categories[category] || categories['Unknown']!;
}

function getCorrectionTypeInfo(type: string) {
  const types: Record<string, { label: string; icon: typeof RefreshCw; color: string }> = {
    Retry: {
      label: 'Retry',
      icon: RefreshCw,
      color: 'text-blue-500',
    },
    RetryWithModification: {
      label: 'Retry with Changes',
      icon: Edit3,
      color: 'text-blue-500',
    },
    UseAlternativeTool: {
      label: 'Use Different Tool',
      icon: Shuffle,
      color: 'text-purple-500',
    },
    Skip: {
      label: 'Skip This Step',
      icon: SkipForward,
      color: 'text-gray-500',
    },
    Decompose: {
      label: 'Break Into Steps',
      icon: GitBranch,
      color: 'text-green-500',
    },
    Defer: {
      label: 'Wait and Retry',
      icon: Clock,
      color: 'text-amber-500',
    },
    RequiresHuman: {
      label: 'Needs Your Help',
      icon: User,
      color: 'text-red-500',
    },
  };

  return types[type] || { label: type, icon: HelpCircle, color: 'text-gray-500' };
}

export default ReflectionPanel;
