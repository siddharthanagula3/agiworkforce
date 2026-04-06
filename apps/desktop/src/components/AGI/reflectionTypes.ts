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
