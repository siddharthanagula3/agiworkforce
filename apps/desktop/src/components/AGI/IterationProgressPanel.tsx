import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { useExecutionStore } from '../../stores/executionStore';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';

type PanelStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'reflecting'
  | 'completed'
  | 'failed'
  | 'paused';

interface IterationProgressPanelProps {
  goalId?: string;
  goalDescription?: string;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
}

function mapExecutionStatusToPanelStatus(
  status?: 'planning' | 'executing' | 'completed' | 'failed',
): PanelStatus {
  switch (status) {
    case 'planning':
      return 'planning';
    case 'executing':
      return 'executing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function readInsightSummary(insight: unknown) {
  const raw = (insight ?? {}) as {
    confidence?: number;
    recommendations?: string[];
    assessment?: Record<string, unknown>;
  };
  const assessment = raw.assessment ?? {};

  const successRate =
    typeof assessment['successRate'] === 'number'
      ? (assessment['successRate'] as number)
      : typeof assessment['success_rate'] === 'number'
        ? (assessment['success_rate'] as number)
        : 0;

  const goalAchievable =
    typeof assessment['goalAchievable'] === 'boolean'
      ? (assessment['goalAchievable'] as boolean)
      : typeof assessment['goal_achievable'] === 'boolean'
        ? (assessment['goal_achievable'] as boolean)
        : true;

  return {
    successRate,
    goalAchievable,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 1,
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
  };
}

function IterationHistoryCard({
  iteration,
  expanded,
  onToggle,
}: {
  iteration: {
    iteration: number;
    stepsSucceeded: number;
    stepsFailed: number;
    consecutiveFailures: number;
    timestamp: number;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalSteps = iteration.stepsSucceeded + iteration.stepsFailed;
  const successRate = totalSteps > 0 ? iteration.stepsSucceeded / totalSteps : 0;
  const status = iteration.stepsFailed > 0 ? 'failed' : 'completed';

  return (
    <div className="bg-surface-base rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-surface-hover transition"
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-1.5 rounded-full ${
              status === 'completed' ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}
          >
            {status === 'completed' ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-foreground text-sm">
              Iteration {iteration.iteration}
            </div>
            <div className="text-xs text-muted-foreground">
              {iteration.stepsSucceeded}/{totalSteps} steps succeeded
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-muted-foreground">Success Rate</div>
              <div className="font-medium text-foreground">{Math.round(successRate * 100)}%</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-muted-foreground">Failure Streak</div>
              <div className="font-medium text-foreground">{iteration.consecutiveFailures}</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-muted-foreground">Succeeded</div>
              <div className="font-medium text-green-400">{iteration.stepsSucceeded}</div>
            </div>
            <div className="rounded border border-border bg-surface-elevated p-2">
              <div className="text-muted-foreground">Failed</div>
              <div className="font-medium text-red-400">{iteration.stepsFailed}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCritiquePanel({
  critique,
}: {
  critique: {
    iteration: number;
    qualityScore: number;
    likelyToSucceed: boolean;
    risksCount: number;
    suggestions: string[];
  };
}) {
  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="font-medium text-amber-400 text-sm">Plan Critique</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="rounded border border-amber-500/20 bg-surface-base p-2">
          <div className="text-muted-foreground">Iteration</div>
          <div className="font-medium text-foreground">{critique.iteration}</div>
        </div>
        <div className="rounded border border-amber-500/20 bg-surface-base p-2">
          <div className="text-muted-foreground">Quality</div>
          <div className="font-medium text-foreground">{critique.qualityScore}/100</div>
        </div>
        <div className="rounded border border-amber-500/20 bg-surface-base p-2">
          <div className="text-muted-foreground">Risks</div>
          <div className="font-medium text-foreground">{critique.risksCount}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        {critique.likelyToSucceed ? 'Plan likely to succeed' : 'Plan likely needs revision'}
      </div>
      {critique.suggestions.length > 0 && (
        <div className="space-y-1">
          {critique.suggestions.slice(0, 4).map((suggestion) => (
            <div key={suggestion} className="text-sm text-foreground">
              • {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IterationProgressPanel({
  goalId,
  goalDescription = 'Processing goal...',
  onPause,
  onResume,
  onStop,
  onRetry,
}: IterationProgressPanelProps) {
  const activeGoal = useExecutionStore((state) => state.activeGoal);
  const reflection = useExecutionStore((state) => state.reflection);
  const iterationProgress = useExecutionStore((state) => state.iterationProgress);

  const [expandedIteration, setExpandedIteration] = useState<number | null>(null);
  const [showInsight, setShowInsight] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const displayGoalId = goalId ?? activeGoal?.id ?? iterationProgress.goalId ?? '';
  const matchesRequestedGoal =
    !goalId || goalId === activeGoal?.id || goalId === iterationProgress.goalId;
  const displayGoalDescription = activeGoal?.description ?? goalDescription;
  const status =
    iterationProgress.status !== 'idle'
      ? iterationProgress.status
      : mapExecutionStatusToPanelStatus(activeGoal?.status);

  useEffect(() => {
    if (
      (status === 'executing' || status === 'planning' || status === 'reflecting') &&
      iterationProgress.startTime
    ) {
      setElapsedTime(Date.now() - iterationProgress.startTime);
      const intervalId = window.setInterval(() => {
        setElapsedTime(Date.now() - iterationProgress.startTime!);
      }, 250);

      return () => {
        window.clearInterval(intervalId);
      };
    }

    if (iterationProgress.startTime) {
      setElapsedTime(Date.now() - iterationProgress.startTime);
    } else {
      setElapsedTime(0);
    }
  }, [iterationProgress.startTime, status]);

  const insightSummary = useMemo(
    () => (reflection.currentInsight ? readInsightSummary(reflection.currentInsight) : null),
    [reflection.currentInsight],
  );

  const successfulIterations = iterationProgress.history.filter(
    (iteration) => iteration.stepsFailed === 0,
  ).length;
  const averageSuccessRate =
    iterationProgress.history.length > 0
      ? Math.round(
          (iterationProgress.history.reduce((total, iteration) => {
            const steps = iteration.stepsSucceeded + iteration.stepsFailed;
            return total + (steps > 0 ? iteration.stepsSucceeded / steps : 0);
          }, 0) /
            iterationProgress.history.length) *
            100,
        )
      : 0;
  const progressPercent =
    activeGoal?.progressPercent ??
    (status === 'completed' || status === 'failed'
      ? 100
      : iterationProgress.currentIteration > 0
        ? 20
        : 0);

  const statusConfig = {
    idle: { icon: Clock, color: 'text-gray-400', label: 'Idle' },
    planning: { icon: Brain, color: 'text-purple-400', label: 'Planning' },
    executing: { icon: Zap, color: 'text-blue-400', label: 'Executing' },
    reflecting: { icon: Brain, color: 'text-amber-400', label: 'Reflecting' },
    completed: { icon: CheckCircle, color: 'text-green-400', label: 'Completed' },
    failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
    paused: { icon: Pause, color: 'text-yellow-400', label: 'Paused' },
  } satisfies Record<PanelStatus, { icon: ElementType; color: string; label: string }>;

  const StatusIcon = statusConfig[status].icon;
  const toggleIteration = useCallback((iteration: number) => {
    setExpandedIteration((current) => (current === iteration ? null : iteration));
  }, []);

  if (!matchesRequestedGoal) {
    return null;
  }

  if (!displayGoalId && status === 'idle' && iterationProgress.history.length === 0) {
    return null;
  }

  return (
    <Card className="bg-surface-elevated border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-surface-base ${statusConfig[status].color}`}>
              {status === 'executing' || status === 'planning' || status === 'reflecting' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <StatusIcon className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Agentic Reasoning Loop</h3>
              <p className="text-xs text-muted-foreground line-clamp-1">{displayGoalDescription}</p>
            </div>
          </div>
          <Badge className={`${statusConfig[status].color} bg-surface-base`}>
            {statusConfig[status].label}
          </Badge>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Iteration {iterationProgress.currentIteration || 0}</span>
            <span>{formatTime(elapsedTime)}</span>
          </div>
          <div className="h-2 bg-surface-base rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status === 'failed'
                  ? 'bg-red-500'
                  : status === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">
              {iterationProgress.currentIteration}
            </div>
            <div className="text-xs text-muted-foreground">Current</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-green-400">{successfulIterations}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-400">
              {iterationProgress.consecutiveFailures}
            </div>
            <div className="text-xs text-muted-foreground">Failures</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">{averageSuccessRate}%</div>
            <div className="text-xs text-muted-foreground">Avg Rate</div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {status === 'executing' || status === 'planning' || status === 'reflecting' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                className="flex-1 flex items-center gap-1"
              >
                <Pause className="w-4 h-4" />
                Pause
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                className="flex items-center gap-1"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            </>
          ) : status === 'paused' ? (
            <>
              <Button size="sm" onClick={onResume} className="flex-1 flex items-center gap-1">
                <Play className="w-4 h-4" />
                Resume
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                className="flex items-center gap-1"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            </>
          ) : status === 'failed' ? (
            <Button size="sm" onClick={onRetry} className="flex-1 flex items-center gap-1">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      {iterationProgress.planCritique && (
        <div className="px-4 pt-4">
          <PlanCritiquePanel critique={iterationProgress.planCritique} />
        </div>
      )}

      {insightSummary && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setShowInsight((current) => !current)}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-base hover:bg-surface-hover transition mb-2"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-400" />
              <span className="font-medium text-foreground text-sm">Latest Reflection</span>
            </div>
            {showInsight ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {showInsight && (
            <div className="rounded-lg border border-border bg-surface-base p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded border border-border bg-surface-elevated p-2">
                  <div className="text-xs text-muted-foreground">Success Rate</div>
                  <div className="font-medium text-foreground">
                    {Math.round(insightSummary.successRate * 100)}%
                  </div>
                </div>
                <div className="rounded border border-border bg-surface-elevated p-2">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="font-medium text-foreground">
                    {Math.round(insightSummary.confidence * 100)}%
                  </div>
                </div>
                <div className="rounded border border-border bg-surface-elevated p-2">
                  <div className="text-xs text-muted-foreground">Achievable</div>
                  <div
                    className={
                      insightSummary.goalAchievable
                        ? 'font-medium text-green-400'
                        : 'font-medium text-red-400'
                    }
                  >
                    {insightSummary.goalAchievable ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
              {insightSummary.recommendations.length > 0 && (
                <div className="space-y-1">
                  {insightSummary.recommendations.slice(0, 4).map((recommendation) => (
                    <div key={recommendation} className="text-foreground">
                      • {recommendation}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-foreground text-sm">
            Iteration History ({iterationProgress.history.length})
          </span>
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {iterationProgress.history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No iterations yet. Waiting for execution...
              </div>
            ) : (
              [...iterationProgress.history]
                .reverse()
                .map((iteration) => (
                  <IterationHistoryCard
                    key={iteration.iteration}
                    iteration={iteration}
                    expanded={expandedIteration === iteration.iteration}
                    onToggle={() => toggleIteration(iteration.iteration)}
                  />
                ))
            )}
          </div>
        </ScrollArea>
      </div>

      {iterationProgress.history.length > 1 && (
        <div className="px-4 pb-4">
          <div className="p-3 rounded-lg bg-surface-base border border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Performance Trend</span>
            </div>
            <div className="h-12 flex items-end gap-1">
              {iterationProgress.history.slice(-20).map((iteration) => {
                const totalSteps = iteration.stepsSucceeded + iteration.stepsFailed;
                const successRate = totalSteps > 0 ? iteration.stepsSucceeded / totalSteps : 0;
                return (
                  <div
                    key={iteration.iteration}
                    className={`flex-1 rounded-t ${
                      successRate === 1
                        ? 'bg-green-500'
                        : successRate >= 0.5
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ height: `${Math.max(successRate * 100, 8)}%` }}
                    title={`Iteration ${iteration.iteration}: ${Math.round(successRate * 100)}% success`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default IterationProgressPanel;
