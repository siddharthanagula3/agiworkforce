/**
 * ReflectionInsightCard
 *
 * Displays insights from the AGI ReflectionEngine including:
 * - Execution assessments
 * - Failed steps analysis
 * - Suggested corrections
 * - Strategy recommendations
 */
import { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Wrench,
  Target,
  Clock,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Zap,
  Shield,
  Network,
  Database,
  Code,
} from 'lucide-react';

// Types matching Rust ReflectionEngine types
export interface FailedStep {
  stepId: string;
  description: string;
  error: string;
  failureCategory: FailureCategory;
  recoverable: boolean;
  suggestedFix?: string;
}

export type FailureCategory =
  | 'ResourceUnavailable'
  | 'PermissionDenied'
  | 'InvalidInput'
  | 'NetworkError'
  | 'Timeout'
  | 'DependencyFailed'
  | 'ToolError'
  | 'StateError'
  | 'Unknown';

export interface Correction {
  stepId: string;
  correctionType: CorrectionType;
  originalAction: string;
  correctedAction: string;
  rationale: string;
  confidence: number;
}

export type CorrectionType =
  | 'RetryWithBackoff'
  | 'ModifyParameters'
  | 'UseDifferentTool'
  | 'SkipStep'
  | 'AddPrerequisite'
  | 'SplitStep'
  | 'RequestHumanInput'
  | 'AdjustResourceLimits';

export interface SubGoal {
  id: string;
  parentGoalId: string;
  fromStepId: string;
  description: string;
  successCriteria: string[];
  suggestedTools: string[];
  priority: number;
}

export interface ExecutionAssessment {
  goalId: string;
  iterationNumber: number;
  overallSuccess: boolean;
  completedSteps: number;
  totalSteps: number;
  failedSteps: FailedStep[];
  successRate: number;
  timeElapsedMs: number;
  resourcesUsed: Record<string, number>;
  bottlenecks: string[];
}

export interface ReflectionInsight {
  id: string;
  goalId: string;
  timestamp: number;
  assessment: ExecutionAssessment;
  corrections: Correction[];
  newStrategy?: string;
  learnings: string[];
  subGoals: SubGoal[];
  confidenceScore: number;
  shouldContinue: boolean;
  goalAchievable: boolean;
  estimatedRemainingIterations?: number;
}

// Failure category icons and colors
const FAILURE_CATEGORY_CONFIG: Record<
  FailureCategory,
  { icon: React.ElementType; color: string; label: string }
> = {
  ResourceUnavailable: { icon: Database, color: 'text-orange-400', label: 'Resource Unavailable' },
  PermissionDenied: { icon: Shield, color: 'text-red-400', label: 'Permission Denied' },
  InvalidInput: { icon: AlertCircle, color: 'text-yellow-400', label: 'Invalid Input' },
  NetworkError: { icon: Network, color: 'text-blue-400', label: 'Network Error' },
  Timeout: { icon: Clock, color: 'text-purple-400', label: 'Timeout' },
  DependencyFailed: { icon: Code, color: 'text-pink-400', label: 'Dependency Failed' },
  ToolError: { icon: Wrench, color: 'text-amber-400', label: 'Tool Error' },
  StateError: { icon: RefreshCw, color: 'text-cyan-400', label: 'State Error' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400', label: 'Unknown' },
};

// Correction type icons and colors
const CORRECTION_TYPE_CONFIG: Record<
  CorrectionType,
  { icon: React.ElementType; color: string; label: string }
> = {
  RetryWithBackoff: { icon: RefreshCw, color: 'text-blue-400', label: 'Retry with Backoff' },
  ModifyParameters: { icon: Wrench, color: 'text-purple-400', label: 'Modify Parameters' },
  UseDifferentTool: { icon: Zap, color: 'text-amber-400', label: 'Use Different Tool' },
  SkipStep: { icon: ChevronDown, color: 'text-gray-400', label: 'Skip Step' },
  AddPrerequisite: { icon: Target, color: 'text-green-400', label: 'Add Prerequisite' },
  SplitStep: { icon: Code, color: 'text-cyan-400', label: 'Split Step' },
  RequestHumanInput: { icon: AlertCircle, color: 'text-orange-400', label: 'Request Human Input' },
  AdjustResourceLimits: { icon: TrendingUp, color: 'text-pink-400', label: 'Adjust Resources' },
};

// Failed Step Card
function FailedStepCard({ step }: { step: FailedStep }) {
  const [expanded, setExpanded] = useState(false);
  const config = FAILURE_CATEGORY_CONFIG[step.failureCategory];
  const Icon = config.icon;

  return (
    <div className="bg-surface-base rounded-lg p-3 border border-red-500/20">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg bg-red-500/10 ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-foreground text-sm truncate">{step.description}</span>
            <Badge
              variant="secondary"
              className={
                step.recoverable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }
            >
              {step.recoverable ? 'Recoverable' : 'Non-recoverable'}
            </Badge>
          </div>
          <Badge variant="secondary" className="text-xs mb-2">
            {config.label}
          </Badge>
          <p className="text-xs text-red-400/80 line-clamp-2">{step.error}</p>

          {step.suggestedFix && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Hide fix' : 'Show suggested fix'}
            </button>
          )}

          {expanded && step.suggestedFix && (
            <div className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300">{step.suggestedFix}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Correction Card
function CorrectionCard({ correction }: { correction: Correction }) {
  const [expanded, setExpanded] = useState(false);
  const config = CORRECTION_TYPE_CONFIG[correction.correctionType];
  const Icon = config.icon;

  return (
    <div className="bg-surface-base rounded-lg p-3 border border-blue-500/20">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg bg-blue-500/10 ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <Badge variant="secondary" className="text-xs">
              {config.label}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Confidence:</span>
              <span
                className={`font-medium ${
                  correction.confidence > 0.8
                    ? 'text-green-400'
                    : correction.confidence > 0.5
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                {(correction.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
            <p className="text-xs text-muted-foreground">
              {correction.originalAction} → {correction.correctedAction}
            </p>
          </button>

          {expanded && (
            <div className="mt-2 p-2 rounded bg-surface-elevated border border-border">
              <p className="text-xs text-foreground">{correction.rationale}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-goal Card
function SubGoalCard({ subGoal }: { subGoal: SubGoal }) {
  return (
    <div className="bg-surface-base rounded-lg p-3 border border-purple-500/20">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
          <Target className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-foreground text-sm">
              Sub-goal #{subGoal.priority}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{subGoal.description}</p>

          {subGoal.successCriteria.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-muted-foreground">Success criteria:</span>
              <ul className="mt-1 space-y-1">
                {subGoal.successCriteria.map((criteria, idx) => (
                  <li key={idx} className="text-xs text-foreground flex items-start gap-1">
                    <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                    {criteria}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {subGoal.suggestedTools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {subGoal.suggestedTools.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-xs">
                  {tool}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Component
interface ReflectionInsightCardProps {
  insight: ReflectionInsight;
  compact?: boolean;
  onApplyCorrections?: (corrections: Correction[]) => void;
  onExecuteSubGoal?: (subGoal: SubGoal) => void;
}

export function ReflectionInsightCard({
  insight,
  compact = false,
  onApplyCorrections,
  onExecuteSubGoal,
}: ReflectionInsightCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(compact ? [] : ['assessment']),
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const {
    assessment,
    corrections,
    subGoals,
    learnings,
    newStrategy,
    confidenceScore,
    goalAchievable,
  } = insight;

  return (
    <Card className="p-4 bg-surface-elevated border-border">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${goalAchievable ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
            <Brain className={`w-5 h-5 ${goalAchievable ? 'text-blue-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Reflection Insight
              <Badge
                variant="secondary"
                className={
                  goalAchievable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }
              >
                {goalAchievable ? 'Achievable' : 'Blocked'}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Iteration {assessment.iterationNumber} •{' '}
              {new Date(insight.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">
            Confidence: {(confidenceScore * 100).toFixed(0)}%
          </div>
          {insight.estimatedRemainingIterations && (
            <div className="text-xs text-muted-foreground">
              ~{insight.estimatedRemainingIterations} iterations remaining
            </div>
          )}
        </div>
      </div>

      {/* Assessment Summary */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-surface-base rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-foreground">
            {assessment.completedSteps}/{assessment.totalSteps}
          </div>
          <div className="text-xs text-muted-foreground">Steps Done</div>
        </div>
        <div className="bg-surface-base rounded-lg p-2 text-center">
          <div
            className={`text-lg font-bold ${
              assessment.successRate > 0.8
                ? 'text-green-400'
                : assessment.successRate > 0.5
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }`}
          >
            {(assessment.successRate * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div className="bg-surface-base rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-foreground">{assessment.failedSteps.length}</div>
          <div className="text-xs text-muted-foreground">Failed Steps</div>
        </div>
        <div className="bg-surface-base rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-foreground">
            {(assessment.timeElapsedMs / 1000).toFixed(1)}s
          </div>
          <div className="text-xs text-muted-foreground">Elapsed</div>
        </div>
      </div>

      {/* New Strategy */}
      {newStrategy && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="font-medium text-amber-400 text-sm">Strategy Update</span>
          </div>
          <p className="text-sm text-foreground">{newStrategy}</p>
        </div>
      )}

      {/* Failed Steps Section */}
      {assessment.failedSteps.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => toggleSection('failures')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-base transition"
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="font-medium text-foreground text-sm">
                Failed Steps ({assessment.failedSteps.length})
              </span>
            </div>
            {expandedSections.has('failures') ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.has('failures') && (
            <div className="mt-2 space-y-2">
              {assessment.failedSteps.map((step) => (
                <FailedStepCard key={step.stepId} step={step} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Corrections Section */}
      {corrections.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => toggleSection('corrections')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-base transition"
          >
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-400" />
              <span className="font-medium text-foreground text-sm">
                Suggested Corrections ({corrections.length})
              </span>
            </div>
            {expandedSections.has('corrections') ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.has('corrections') && (
            <>
              <div className="mt-2 space-y-2">
                {corrections.map((correction) => (
                  <CorrectionCard key={correction.stepId} correction={correction} />
                ))}
              </div>
              {onApplyCorrections && (
                <Button
                  size="sm"
                  onClick={() => onApplyCorrections(corrections)}
                  className="mt-3 w-full"
                >
                  Apply All Corrections
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Sub-goals Section */}
      {subGoals.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => toggleSection('subgoals')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-base transition"
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-400" />
              <span className="font-medium text-foreground text-sm">
                Sub-goals ({subGoals.length})
              </span>
            </div>
            {expandedSections.has('subgoals') ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.has('subgoals') && (
            <div className="mt-2 space-y-2">
              {subGoals.map((subGoal) => (
                <div key={subGoal.id}>
                  <SubGoalCard subGoal={subGoal} />
                  {onExecuteSubGoal && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onExecuteSubGoal(subGoal)}
                      className="mt-1 w-full"
                    >
                      Execute Sub-goal
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learnings Section */}
      {learnings.length > 0 && (
        <div>
          <button
            onClick={() => toggleSection('learnings')}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-base transition"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-green-400" />
              <span className="font-medium text-foreground text-sm">
                Learnings ({learnings.length})
              </span>
            </div>
            {expandedSections.has('learnings') ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {expandedSections.has('learnings') && (
            <ul className="mt-2 space-y-1">
              {learnings.map((learning, idx) => (
                <li
                  key={idx}
                  className="text-sm text-muted-foreground flex items-start gap-2 p-2 bg-surface-base rounded-lg"
                >
                  <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  {learning}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Continue/Stop Indicator */}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {insight.shouldContinue ? (
            <>
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-400">Continuing iteration...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Goal achieved or terminated</span>
            </>
          )}
        </div>
        {assessment.bottlenecks.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-orange-400">
            <AlertTriangle className="w-3 h-3" />
            {assessment.bottlenecks.length} bottleneck(s)
          </div>
        )}
      </div>
    </Card>
  );
}

export default ReflectionInsightCard;
