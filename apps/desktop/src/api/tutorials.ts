/**
 * Tutorials API — Tauri command wrappers for tutorials.rs
 *
 * Covers all 21 commands:
 *   get_tutorials, get_tutorial, get_recommended_tutorial,
 *   start_tutorial, complete_tutorial_step, skip_tutorial_step,
 *   complete_tutorial, reset_tutorial, get_tutorial_progress,
 *   get_user_tutorial_progress, get_tutorial_stats, record_step_view,
 *   get_user_rewards, has_reward, has_unlocked_feature, get_user_credits,
 *   populate_sample_data, has_sample_data, clear_sample_data,
 *   submit_tutorial_feedback, record_help_session
 */

import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types (mirrors Rust structs in ui/onboarding/mod.rs, rewards.rs, sample_data.rs)
// =============================================================================

export type TutorialCategory =
  | 'getting_started'
  | 'agent_templates'
  | 'workflow_orchestration'
  | 'team_collaboration'
  | 'advanced_features'
  | 'integrations';

export type TutorialDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface ValidationCriteria {
  check_type: ValidationType;
  expected_value: string;
}

export type ValidationType =
  | { type: 'element_exists' }
  | { type: 'value_equals' }
  | { type: 'state_matches' }
  | { type: 'custom'; value: string };

export interface ActionType {
  type: string;
  selector?: string;
  field?: string;
  value?: string;
  placeholder?: string;
  duration_ms?: number;
  route?: string;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  component: string;
  action_required: ActionType;
  help_text: string;
  estimated_duration_seconds: number;
  validation_criteria: ValidationCriteria | null;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: TutorialCategory;
  difficulty: TutorialDifficulty;
  estimated_minutes: number;
  steps: TutorialStep[];
  prerequisites: string[];
  rewards: string[];
  tags: string[];
}

export interface OnboardingProgress {
  user_id: string;
  tutorial_id: string;
  current_step: number;
  completed_steps: string[];
  started_at: number;
  completed_at: number | null;
  last_updated: number;
}

export interface UserTutorialProgress {
  user_id: string;
  completed_tutorials: Record<string, number>;
  in_progress_tutorials: Record<string, OnboardingProgress>;
  total_tutorials: number;
  completion_percentage: number;
  earned_rewards: string[];
}

export interface TutorialStats {
  tutorial_id: string;
  total_starts: number;
  total_completions: number;
  average_completion_time_seconds: number;
  completion_rate: number;
  average_steps_completed: number;
  most_common_drop_off_step: string | null;
}

// --- Rewards ---

export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RewardValue {
  type: string;
  rarity?: BadgeRarity;
  feature_id?: string;
  amount?: number;
}

export interface RewardType {
  type: 'badge' | 'unlocked_feature' | 'credits' | 'achievement';
}

export interface Reward {
  id: string;
  reward_type: RewardType;
  name: string;
  description: string;
  icon: string;
  value: RewardValue;
}

// --- Sample Data ---

export interface SampleDataSummary {
  goals_created: number;
  workflows_created: number;
  templates_installed: number;
  sample_files_created: number;
}

// =============================================================================
// Tutorial Management Commands
// =============================================================================

/** Get all available tutorials. */
export async function getTutorials(): Promise<Tutorial[]> {
  try {
    return await invoke<Tutorial[]>('get_tutorials');
  } catch (error) {
    throw new Error(`Failed to get tutorials: ${error}`);
  }
}

/** Get a single tutorial by ID. */
export async function getTutorial(tutorialId: string): Promise<Tutorial> {
  try {
    return await invoke<Tutorial>('get_tutorial', { tutorialId });
  } catch (error) {
    throw new Error(`Failed to get tutorial "${tutorialId}": ${error}`);
  }
}

/** Get the recommended next tutorial for a user. */
export async function getRecommendedTutorial(userId: string): Promise<Tutorial | null> {
  try {
    return await invoke<Tutorial | null>('get_recommended_tutorial', { userId });
  } catch (error) {
    throw new Error(`Failed to get recommended tutorial: ${error}`);
  }
}

// =============================================================================
// Tutorial Progress Commands
// =============================================================================

/** Start a tutorial for a user. Returns initial progress. */
export async function startTutorial(
  userId: string,
  tutorialId: string,
): Promise<OnboardingProgress> {
  try {
    return await invoke<OnboardingProgress>('start_tutorial', { userId, tutorialId });
  } catch (error) {
    throw new Error(`Failed to start tutorial "${tutorialId}": ${error}`);
  }
}

/** Complete a specific step in a tutorial. Returns updated progress. */
export async function completeTutorialStep(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<OnboardingProgress> {
  try {
    return await invoke<OnboardingProgress>('complete_tutorial_step', {
      userId,
      tutorialId,
      stepId,
    });
  } catch (error) {
    throw new Error(`Failed to complete tutorial step "${stepId}": ${error}`);
  }
}

/** Skip a specific step in a tutorial. Returns updated progress. */
export async function skipTutorialStep(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<OnboardingProgress> {
  try {
    return await invoke<OnboardingProgress>('skip_tutorial_step', {
      userId,
      tutorialId,
      stepId,
    });
  } catch (error) {
    throw new Error(`Failed to skip tutorial step "${stepId}": ${error}`);
  }
}

/** Complete an entire tutorial and receive rewards. */
export async function completeTutorial(userId: string, tutorialId: string): Promise<Reward[]> {
  try {
    return await invoke<Reward[]>('complete_tutorial', { userId, tutorialId });
  } catch (error) {
    throw new Error(`Failed to complete tutorial "${tutorialId}": ${error}`);
  }
}

/** Reset a user's progress on a tutorial. */
export async function resetTutorial(userId: string, tutorialId: string): Promise<void> {
  try {
    await invoke('reset_tutorial', { userId, tutorialId });
  } catch (error) {
    throw new Error(`Failed to reset tutorial "${tutorialId}": ${error}`);
  }
}

/** Get progress for a specific tutorial. */
export async function getTutorialProgress(
  userId: string,
  tutorialId: string,
): Promise<OnboardingProgress> {
  try {
    return await invoke<OnboardingProgress>('get_tutorial_progress', { userId, tutorialId });
  } catch (error) {
    throw new Error(`Failed to get tutorial progress: ${error}`);
  }
}

/** Get a user's progress across all tutorials. */
export async function getUserTutorialProgress(userId: string): Promise<UserTutorialProgress> {
  try {
    return await invoke<UserTutorialProgress>('get_user_tutorial_progress', { userId });
  } catch (error) {
    throw new Error(`Failed to get user tutorial progress: ${error}`);
  }
}

/** Get aggregate stats for a specific tutorial. */
export async function getTutorialStats(tutorialId: string): Promise<TutorialStats> {
  try {
    return await invoke<TutorialStats>('get_tutorial_stats', { tutorialId });
  } catch (error) {
    throw new Error(`Failed to get tutorial stats: ${error}`);
  }
}

/** Record that a user viewed a specific step (analytics). */
export async function recordStepView(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<void> {
  try {
    await invoke('record_step_view', { userId, tutorialId, stepId });
  } catch (error) {
    throw new Error(`Failed to record step view: ${error}`);
  }
}

// =============================================================================
// Reward Commands
// =============================================================================

/** Get all rewards earned by a user. */
export async function getUserRewards(userId: string): Promise<Reward[]> {
  try {
    return await invoke<Reward[]>('get_user_rewards', { userId });
  } catch (error) {
    throw new Error(`Failed to get user rewards: ${error}`);
  }
}

/** Check if a user has a specific reward. */
export async function hasReward(userId: string, rewardId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('has_reward', { userId, rewardId });
  } catch (error) {
    throw new Error(`Failed to check reward: ${error}`);
  }
}

/** Check if a user has unlocked a specific feature. */
export async function hasUnlockedFeature(userId: string, featureId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('has_unlocked_feature', { userId, featureId });
  } catch (error) {
    throw new Error(`Failed to check unlocked feature: ${error}`);
  }
}

/** Get a user's total credit balance. */
export async function getUserCredits(userId: string): Promise<number> {
  try {
    return await invoke<number>('get_user_credits', { userId });
  } catch (error) {
    throw new Error(`Failed to get user credits: ${error}`);
  }
}

// =============================================================================
// Sample Data Commands
// =============================================================================

/** Populate sample data for a new user. */
export async function populateSampleData(userId: string): Promise<SampleDataSummary> {
  try {
    return await invoke<SampleDataSummary>('populate_sample_data', { userId });
  } catch (error) {
    throw new Error(`Failed to populate sample data: ${error}`);
  }
}

/** Check if a user already has sample data. */
export async function hasSampleData(userId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('has_sample_data', { userId });
  } catch (error) {
    throw new Error(`Failed to check sample data: ${error}`);
  }
}

/** Remove all sample data for a user. */
export async function clearSampleData(userId: string): Promise<void> {
  try {
    await invoke('clear_sample_data', { userId });
  } catch (error) {
    throw new Error(`Failed to clear sample data: ${error}`);
  }
}

// =============================================================================
// Feedback & Help Commands
// =============================================================================

/** Submit feedback for a tutorial. */
export async function submitTutorialFeedback(
  userId: string,
  tutorialId: string,
  rating: number,
  helpful: boolean,
  feedbackText?: string,
): Promise<void> {
  try {
    await invoke('submit_tutorial_feedback', {
      userId,
      tutorialId,
      rating,
      feedbackText: feedbackText ?? null,
      helpful,
    });
  } catch (error) {
    throw new Error(`Failed to submit tutorial feedback: ${error}`);
  }
}

/** Record a help session for analytics. */
export async function recordHelpSession(
  userId: string,
  context: string,
  query?: string,
  helpArticleId?: string,
  wasHelpful?: boolean,
): Promise<void> {
  try {
    await invoke('record_help_session', {
      userId,
      context,
      query: query ?? null,
      helpArticleId: helpArticleId ?? null,
      wasHelpful: wasHelpful ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to record help session: ${error}`);
  }
}

// =============================================================================
// Client object for structured access
// =============================================================================

export const TutorialClient = {
  // Tutorial management
  getAll: getTutorials,
  get: getTutorial,
  getRecommended: getRecommendedTutorial,

  // Progress
  start: startTutorial,
  completeStep: completeTutorialStep,
  skipStep: skipTutorialStep,
  complete: completeTutorial,
  reset: resetTutorial,
  getProgress: getTutorialProgress,
  getUserProgress: getUserTutorialProgress,
  getStats: getTutorialStats,
  recordView: recordStepView,

  // Rewards
  rewards: {
    getUserRewards,
    hasReward,
    hasUnlockedFeature,
    getUserCredits,
  },

  // Sample data
  sampleData: {
    populate: populateSampleData,
    has: hasSampleData,
    clear: clearSampleData,
  },

  // Feedback
  submitFeedback: submitTutorialFeedback,
  recordHelp: recordHelpSession,
} as const;
