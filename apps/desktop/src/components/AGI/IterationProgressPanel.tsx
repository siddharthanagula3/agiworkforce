/**
 * IterationProgressPanel
 *
 * Displays the progress of multi-turn agentic reasoning iterations.
 * Shows the achieve_goal loop progress with real-time updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Brain,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { ReflectionInsightCard, type ReflectionInsight } from './ReflectionInsightCard';

// Event types from Rust backend
interface IterationStartEvent {
  goalId: string;
  iteration: number;
  maxIterations: number;
  consecutiveFailures: number;
}

interface IterationCompleteEvent {
  goalId: string;
  iteration: number;
  stepResults: StepResult[];
  duration: number;
  success: boolean;
}

interface PlanCritiqueEvent {
  goalId: string;
  risks: PlanRisk[];
  suggestions: string[];
  overallViability: number;
}

interface PlanRevisedEvent {
  goalId: string;
  originalStepCount: number;
  revisedStepCount: number;
  changesSummary: string;
}

interface ReflectionCompletedEvent {
  goalId: string;
  insight: ReflectionInsight;
}

interface GoalUnachievableEvent {
  goalId: string;
  reason: string;
  suggestions: string[];
}

interface SubGoalsEvent {
  goalId: string;
  subGoals: Array<{
    id: string;
    description: string;
    priority: number;
  }>;
}

interface StepResult {
  stepId: string;
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

interface PlanRisk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation?: string;
}

// Iteration status
type IterationStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'reflecting'
  | 'completed'
  | 'failed'
  | 'paused';

interface IterationState {
  goalId: string;
  goalDescription: string;
  status: IterationStatus;
  currentIteration: number;
  maxIterations: number;
  consecutiveFailures: number;
  iterations: IterationRecord[];
  currentInsight?: ReflectionInsight;
  planRisks: PlanRisk[];
  startTime: number;
  elapsedTime: number;
}

interface IterationRecord {
  iteration: number;
  status: 'completed' | 'failed' | 'skipped';
  stepResults: StepResult[];
  duration: number;
  insight?: ReflectionInsight;
  timestamp: number;
}

// Step Result Card
function StepResultCard({ result }: { result: StepResult }) {
  return (
    <div
      className={`p-2 rounded-lg border ${
        result.success ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-sm text-foreground">{result.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">{result.duration}ms</span>
      </div>
      {result.error && <p className="text-xs text-red-400/80 mt-1 ml-6">{result.error}</p>}
    </div>
  );
}

// Iteration History Card
function IterationHistoryCard({
  record,
  expanded,
  onToggle,
}: {
  record: IterationRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const successCount = record.stepResults.filter((r) => r.success).length;
  const totalCount = record.stepResults.length;

  return (
    <div className="bg-surface-base rounded-lg border border-border">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-surface-hover transition"
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-1.5 rounded-full ${
              record.status === 'completed' ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}
          >
            {record.status === 'completed' ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-left">
            <div className="font-medium text-foreground text-sm">Iteration {record.iteration}</div>
            <div className="text-xs text-muted-foreground">
              {successCount}/{totalCount} steps • {(record.duration / 1000).toFixed(1)}s
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
        <div className="px-3 pb-3 space-y-2">
          {record.stepResults.map((result) => (
            <StepResultCard key={result.stepId} result={result} />
          ))}
          {record.insight && (
            <div className="mt-3">
              <ReflectionInsightCard insight={record.insight} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Plan Risks Panel
function PlanRisksPanel({ risks }: { risks: PlanRisk[] }) {
  if (risks.length === 0) return null;

  const severityColors = {
    low: 'text-yellow-400 bg-yellow-500/10',
    medium: 'text-orange-400 bg-orange-500/10',
    high: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="font-medium text-amber-400 text-sm">Plan Risks</span>
      </div>
      <div className="space-y-2">
        {risks.map((risk, idx) => (
          <div key={idx} className="text-sm">
            <div className="flex items-center gap-2">
              <Badge className={severityColors[risk.severity]}>{risk.severity}</Badge>
              <span className="text-foreground">{risk.description}</span>
            </div>
            {risk.mitigation && (
              <p className="text-xs text-muted-foreground mt-1 ml-14">
                Mitigation: {risk.mitigation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Component
interface IterationProgressPanelProps {
  goalId?: string;
  goalDescription?: string;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
}

export function IterationProgressPanel({
  goalId,
  goalDescription = 'Processing goal...',
  onPause,
  onResume,
  onStop,
  onRetry,
}: IterationProgressPanelProps) {
  const [state, setState] = useState<IterationState>({
    goalId: goalId || '',
    goalDescription,
    status: 'idle',
    currentIteration: 0,
    maxIterations: 100,
    consecutiveFailures: 0,
    iterations: [],
    planRisks: [],
    startTime: 0,
    elapsedTime: 0,
  });

  const [expandedIteration, setExpandedIteration] = useState<number | null>(null);
  const [showInsight, setShowInsight] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Update elapsed time
  useEffect(() => {
    if (
      state.status === 'executing' ||
      state.status === 'planning' ||
      state.status === 'reflecting'
    ) {
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsedTime: Date.now() - prev.startTime,
        }));
      }, 100);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status]);

  // Listen for Tauri events
  useEffect(() => {
    let isMounted = true;
    const unsubscribers: Array<() => void> = [];
    const pendingListeners: Array<Promise<() => void>> = [];

    // Helper to safely add listeners
    const addListener = <T,>(eventName: string, handler: (event: { payload: T }) => void) => {
      const promise = listen<T>(eventName, (event) => {
        if (isMounted) {
          handler(event);
        }
      });
      pendingListeners.push(promise);
      promise.then((unlisten) => {
        if (isMounted) {
          unsubscribers.push(unlisten);
        } else {
          unlisten();
        }
      });
    };

    // Iteration start
    addListener<IterationStartEvent>('agi:goal:iteration_start', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      setState((prev) => ({
        ...prev,
        goalId: event.payload.goalId,
        status: 'executing',
        currentIteration: event.payload.iteration,
        maxIterations: event.payload.maxIterations,
        consecutiveFailures: event.payload.consecutiveFailures,
        startTime: prev.startTime || Date.now(),
      }));
    });

    // Iteration complete
    addListener<IterationCompleteEvent>('agi:goal:iteration_complete', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      setState((prev) => ({
        ...prev,
        iterations: [
          ...prev.iterations,
          {
            iteration: event.payload.iteration,
            status: event.payload.success ? 'completed' : 'failed',
            stepResults: event.payload.stepResults,
            duration: event.payload.duration,
            timestamp: Date.now(),
          },
        ],
        status: 'reflecting',
      }));
    });

    // Plan critique
    addListener<PlanCritiqueEvent>('agi:reflection:plan_critique', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      setState((prev) => ({
        ...prev,
        planRisks: event.payload.risks,
        status: 'planning',
      }));
    });

    // Plan revised
    addListener<PlanRevisedEvent>('agi:reflection:plan_revised', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      // Update status after plan revision
      setState((prev) => ({
        ...prev,
        status: 'executing',
      }));
    });

    // Reflection completed
    addListener<ReflectionCompletedEvent>('agi:reflection:completed', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      setState((prev) => {
        // Update the last iteration with the insight
        const iterations = [...prev.iterations];
        const lastIteration = iterations[iterations.length - 1];
        if (lastIteration) {
          lastIteration.insight = event.payload.insight;
        }
        return {
          ...prev,
          iterations,
          currentInsight: event.payload.insight,
          status: event.payload.insight.shouldContinue ? 'executing' : 'completed',
        };
      });
    });

    // Goal unachievable
    addListener<GoalUnachievableEvent>('agi:goal:unachievable', (event) => {
      if (goalId && event.payload.goalId !== goalId) return;
      setState((prev) => ({
        ...prev,
        status: 'failed',
      }));
    });

    // Sub-goals
    addListener<SubGoalsEvent>('agi:reflection:sub_goals', (_event) => {
      // Handle sub-goals if needed
    });

    return () => {
      isMounted = false;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [goalId]);

  const toggleIteration = useCallback((iteration: number) => {
    setExpandedIteration((prev) => (prev === iteration ? null : iteration));
  }, []);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const successfulIterations = state.iterations.filter((i) => i.status === 'completed').length;
  const progress =
    state.maxIterations > 0 ? (state.currentIteration / state.maxIterations) * 100 : 0;

  const statusConfig = {
    idle: { icon: Clock, color: 'text-gray-400', label: 'Idle' },
    planning: { icon: Brain, color: 'text-purple-400', label: 'Planning' },
    executing: { icon: Zap, color: 'text-blue-400', label: 'Executing' },
    reflecting: { icon: Brain, color: 'text-amber-400', label: 'Reflecting' },
    completed: { icon: CheckCircle, color: 'text-green-400', label: 'Completed' },
    failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
    paused: { icon: Pause, color: 'text-yellow-400', label: 'Paused' },
  };

  const StatusIcon = statusConfig[state.status].icon;

  return (
    <Card className="bg-surface-elevated border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-surface-base ${statusConfig[state.status].color}`}>
              {state.status === 'executing' ||
              state.status === 'planning' ||
              state.status === 'reflecting' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <StatusIcon className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Agentic Reasoning Loop</h3>
              <p className="text-xs text-muted-foreground line-clamp-1">{state.goalDescription}</p>
            </div>
          </div>
          <Badge className={`${statusConfig[state.status].color} bg-surface-base`}>
            {statusConfig[state.status].label}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              Iteration {state.currentIteration} of {state.maxIterations}
            </span>
            <span>{formatTime(state.elapsedTime)}</span>
          </div>
          <div className="h-2 bg-surface-base rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                state.status === 'failed'
                  ? 'bg-red-500'
                  : state.status === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">{state.currentIteration}</div>
            <div className="text-xs text-muted-foreground">Current</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-green-400">{successfulIterations}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-400">{state.consecutiveFailures}</div>
            <div className="text-xs text-muted-foreground">Failures</div>
          </div>
          <div className="bg-surface-base rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">
              {state.iterations.length > 0
                ? Math.round(
                    state.iterations.reduce((sum, i) => sum + i.duration, 0) /
                      state.iterations.length /
                      1000,
                  )
                : 0}
              s
            </div>
            <div className="text-xs text-muted-foreground">Avg Time</div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2 mt-3">
          {state.status === 'executing' ||
          state.status === 'planning' ||
          state.status === 'reflecting' ? (
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
          ) : state.status === 'paused' ? (
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
          ) : state.status === 'failed' ? (
            <Button size="sm" onClick={onRetry} className="flex-1 flex items-center gap-1">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      {/* Plan Risks */}
      {state.planRisks.length > 0 && (
        <div className="px-4 pt-4">
          <PlanRisksPanel risks={state.planRisks} />
        </div>
      )}

      {/* Current Insight */}
      {state.currentInsight && (
        <div className="px-4 pt-4">
          <button
            onClick={() => setShowInsight(!showInsight)}
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
          {showInsight && <ReflectionInsightCard insight={state.currentInsight} />}
        </div>
      )}

      {/* Iteration History */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-foreground text-sm">
            Iteration History ({state.iterations.length})
          </span>
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {state.iterations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No iterations yet. Waiting for execution...
              </div>
            ) : (
              [...state.iterations]
                .reverse()
                .map((record) => (
                  <IterationHistoryCard
                    key={record.iteration}
                    record={record}
                    expanded={expandedIteration === record.iteration}
                    onToggle={() => toggleIteration(record.iteration)}
                  />
                ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Performance Chart Placeholder */}
      {state.iterations.length > 1 && (
        <div className="px-4 pb-4">
          <div className="p-3 rounded-lg bg-surface-base border border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Performance Trend</span>
            </div>
            <div className="h-12 flex items-end gap-1">
              {state.iterations.slice(-20).map((iter, idx) => {
                const successRate =
                  iter.stepResults.filter((r) => r.success).length / iter.stepResults.length;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t ${
                      successRate === 1
                        ? 'bg-green-500'
                        : successRate >= 0.5
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ height: `${successRate * 100}%` }}
                    title={`Iteration ${iter.iteration}: ${(successRate * 100).toFixed(0)}% success`}
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
