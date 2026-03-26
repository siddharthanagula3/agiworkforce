/**
 * Reflection Engine API
 *
 * TypeScript API wrappers for the AGI Reflection Engine commands.
 * The Reflection Engine analyzes execution results, identifies failure patterns,
 * suggests corrections, and provides recommendations for improvement.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * A reflection insight generated after analyzing execution results.
 * Contains assessment, failure patterns, corrections, and recommendations.
 */
export interface ReflectionInsight {
  id: string;
  goalId: string;
  assessment: ExecutionAssessment;
  failurePatterns: FailurePattern[];
  corrections: Correction[];
  subGoals: SubGoal[];
  recommendations: string[];
  confidence: number;
  timestamp: number;
}

/**
 * Assessment of overall execution quality.
 */
export interface ExecutionAssessment {
  successRate: number;
  successfulSteps: string[];
  failedSteps: FailedStep[];
  goalAchievable: boolean;
  progressEstimate: number;
  resourceEfficiency: number;
  timeEfficiency: number;
}

/**
 * Details about a failed step.
 */
export interface FailedStep {
  stepId: string;
  toolId: string;
  description: string;
  error?: string;
  failureCategory: FailureCategory;
  recoverable: boolean;
}

/**
 * Categories of failures for pattern recognition.
 */
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

/**
 * Pattern identified across multiple failures.
 */
export interface FailurePattern {
  patternId: string;
  category: FailureCategory;
  description: string;
  affectedSteps: string[];
  rootCause?: string;
  frequency: number;
}

/**
 * Suggested correction for a failed step.
 */
export interface Correction {
  forStepId: string;
  correctionType: CorrectionType;
  description: string;
  alternativeTool?: string;
  modifiedParameters?: Record<string, unknown>;
  priority: number;
}

/**
 * Types of corrections that can be applied.
 */
export type CorrectionType =
  | 'Retry'
  | 'RetryWithModification'
  | 'UseAlternativeTool'
  | 'Skip'
  | 'Decompose'
  | 'Defer'
  | 'RequiresHuman';

/**
 * Sub-goal derived from a complex failed step.
 */
export interface SubGoal {
  id: string;
  parentGoalId: string;
  fromStepId: string;
  description: string;
  successCriteria: string[];
  suggestedTools: string[];
  priority: number;
}

// ============================================================================
// User-friendly display helpers
// ============================================================================

/**
 * Get a human-readable label for a failure category.
 */
export function getFailureCategoryLabel(category: FailureCategory): string {
  const labels: Record<FailureCategory, string> = {
    ResourceUnavailable: 'Resource Not Found',
    PermissionDenied: 'Permission Denied',
    InvalidInput: 'Invalid Input',
    NetworkError: 'Network Error',
    Timeout: 'Timeout',
    DependencyFailed: 'Dependency Failed',
    ToolError: 'Tool Error',
    StateError: 'State Error',
    Unknown: 'Unknown Error',
  };
  return labels[category] || category;
}

/**
 * Get a human-readable label for a correction type.
 */
export function getCorrectionTypeLabel(type: CorrectionType): string {
  const labels: Record<CorrectionType, string> = {
    Retry: 'Retry',
    RetryWithModification: 'Retry with Changes',
    UseAlternativeTool: 'Use Different Tool',
    Skip: 'Skip This Step',
    Decompose: 'Break Into Smaller Steps',
    Defer: 'Wait and Retry Later',
    RequiresHuman: 'Needs Your Help',
  };
  return labels[type] || type;
}

/**
 * Get a color class for a failure category (for UI styling).
 */
export function getFailureCategoryColor(category: FailureCategory): string {
  const colors: Record<FailureCategory, string> = {
    ResourceUnavailable: 'text-orange-500',
    PermissionDenied: 'text-red-500',
    InvalidInput: 'text-yellow-500',
    NetworkError: 'text-blue-500',
    Timeout: 'text-purple-500',
    DependencyFailed: 'text-pink-500',
    ToolError: 'text-red-400',
    StateError: 'text-amber-500',
    Unknown: 'text-gray-500',
  };
  return colors[category] || 'text-gray-500';
}

/**
 * Get an icon name for a correction type.
 */
export function getCorrectionTypeIcon(type: CorrectionType): string {
  const icons: Record<CorrectionType, string> = {
    Retry: 'refresh-cw',
    RetryWithModification: 'edit-3',
    UseAlternativeTool: 'shuffle',
    Skip: 'skip-forward',
    Decompose: 'git-branch',
    Defer: 'clock',
    RequiresHuman: 'user',
  };
  return icons[type] || 'help-circle';
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get reflection insights for a goal.
 * Returns the most recent reflection insight containing assessment,
 * failure patterns, corrections, and recommendations.
 */
export async function getReflectionInsights(goalId: string): Promise<ReflectionInsight | null> {
  if (!isTauri) {
    console.debug('[reflection] getReflectionInsights (mock)', goalId);
    return null;
  }

  try {
    const result = await invoke<ReflectionInsight | null>('agi_get_reflection_insights', {
      goalId,
    });
    return result;
  } catch (error) {
    console.error('[reflection] Failed to get reflection insights:', error);
    return null;
  }
}

/**
 * Get all failure patterns from recent reflections for a goal.
 * Patterns are aggregated and sorted by frequency (most common first).
 */
export async function getFailurePatterns(goalId: string): Promise<FailurePattern[]> {
  if (!isTauri) {
    console.debug('[reflection] getFailurePatterns (mock)', goalId);
    return [];
  }

  try {
    const result = await invoke<FailurePattern[]>('agi_get_failure_patterns', { goalId });
    return result;
  } catch (error) {
    console.error('[reflection] Failed to get failure patterns:', error);
    return [];
  }
}

/**
 * Get suggested corrections for failed steps.
 * Corrections are prioritized based on impact and feasibility.
 */
export async function getSuggestedCorrections(goalId: string): Promise<Correction[]> {
  if (!isTauri) {
    console.debug('[reflection] getSuggestedCorrections (mock)', goalId);
    return [];
  }

  try {
    const result = await invoke<Correction[]>('agi_get_suggested_corrections', { goalId });
    return result;
  } catch (error) {
    console.error('[reflection] Failed to get suggested corrections:', error);
    return [];
  }
}

/**
 * Get sub-goals derived from failed steps.
 * Sub-goals help break down complex failures into manageable pieces.
 */
export async function getSubGoals(goalId: string): Promise<SubGoal[]> {
  if (!isTauri) {
    console.debug('[reflection] getSubGoals (mock)', goalId);
    return [];
  }

  try {
    const result = await invoke<SubGoal[]>('agi_get_sub_goals', { goalId });
    return result;
  } catch (error) {
    console.error('[reflection] Failed to get sub-goals:', error);
    return [];
  }
}

/**
 * Get recommendations for improving execution.
 * AI-generated suggestions based on failure analysis.
 */
export async function getRecommendations(goalId: string): Promise<string[]> {
  if (!isTauri) {
    console.debug('[reflection] getRecommendations (mock)', goalId);
    return [];
  }

  try {
    const result = await invoke<string[]>('agi_get_recommendations', { goalId });
    return result;
  } catch (error) {
    console.error('[reflection] Failed to get recommendations:', error);
    return [];
  }
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/**
 * Calculate overall health score based on reflection insight.
 * Returns a score from 0-100.
 */
export function calculateHealthScore(insight: ReflectionInsight): number {
  const weights = {
    successRate: 0.4,
    goalAchievable: 0.3,
    confidence: 0.2,
    recoverableFailures: 0.1,
  };

  const { assessment } = insight;

  // Calculate recoverable failure ratio
  const totalFailed = assessment.failedSteps.length;
  const recoverableFailed = assessment.failedSteps.filter((s) => s.recoverable).length;
  const recoverableRatio = totalFailed > 0 ? recoverableFailed / totalFailed : 1;

  const score =
    assessment.successRate * 100 * weights.successRate +
    (assessment.goalAchievable ? 100 : 0) * weights.goalAchievable +
    insight.confidence * 100 * weights.confidence +
    recoverableRatio * 100 * weights.recoverableFailures;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Get a summary description for the insight.
 */
export function getInsightSummary(insight: ReflectionInsight): string {
  const { assessment, failurePatterns, corrections } = insight;
  const successPercent = Math.round(assessment.successRate * 100);

  if (successPercent === 100) {
    return 'All steps completed successfully.';
  }

  if (successPercent >= 75) {
    return `${successPercent}% success rate. Minor issues detected with ${failurePatterns.length} pattern(s).`;
  }

  if (successPercent >= 50) {
    return `${successPercent}% success rate. ${corrections.length} correction(s) suggested.`;
  }

  if (assessment.goalAchievable) {
    return `${successPercent}% success rate. Goal is still achievable with suggested corrections.`;
  }

  return `${successPercent}% success rate. Significant issues detected. Consider the suggested corrections.`;
}
