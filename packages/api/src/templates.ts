/**
 * Templates & Tutorials API — typed wrappers for template and tutorial Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  installed: boolean;
  [key: string]: unknown;
}
export interface Tutorial {
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
  difficulty: string;
  estimatedMinutes: number;
}
export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}
export interface OnboardingProgress {
  tutorialId: string;
  currentStep: string;
  completedSteps: string[];
  startedAt: string;
}
export interface Reward {
  id: string;
  name: string;
  description: string;
  type: string;
}
export interface UserTutorialProgress {
  completedTutorials: string[];
  totalRewards: number;
  credits: number;
}
export interface TutorialStats {
  completions: number;
  avgDuration: number;
  rating: number;
}
export interface SampleDataSummary {
  conversations: number;
  memories: number;
  projects: number;
}

// ---- Templates ----

export async function getAllTemplates(): Promise<AgentTemplate[]> {
  return command<AgentTemplate[]>('get_all_templates');
}
export async function getTemplateById(id: string): Promise<AgentTemplate | null> {
  return command<AgentTemplate | null>('get_template_by_id', { id });
}
export async function getTemplatesByCategory(category: string): Promise<AgentTemplate[]> {
  return command<AgentTemplate[]>('get_templates_by_category', { category });
}
export async function installTemplate(templateId: string): Promise<void> {
  return command<void>('install_template', { templateId });
}
export async function getInstalledTemplates(): Promise<AgentTemplate[]> {
  return command<AgentTemplate[]>('get_installed_templates');
}
export async function searchTemplates(query: string): Promise<AgentTemplate[]> {
  return command<AgentTemplate[]>('search_templates', { query });
}
export async function executeTemplate(
  templateId: string,
  params: Record<string, string>,
): Promise<string> {
  return command<string>('execute_template', { templateId, params });
}
export async function uninstallTemplate(templateId: string): Promise<void> {
  return command<void>('uninstall_template', { templateId });
}
export async function getTemplateCategories(): Promise<string[]> {
  return command<string[]>('get_template_categories');
}

// ---- Tutorials ----

export async function getTutorials(): Promise<Tutorial[]> {
  return command<Tutorial[]>('get_tutorials');
}
export async function getTutorial(tutorialId: string): Promise<Tutorial> {
  return command<Tutorial>('get_tutorial', { tutorialId });
}
export async function getRecommendedTutorial(userId: string): Promise<Tutorial | null> {
  return command<Tutorial | null>('get_recommended_tutorial', { userId });
}
export async function startTutorial(
  userId: string,
  tutorialId: string,
): Promise<OnboardingProgress> {
  return command<OnboardingProgress>('start_tutorial', { userId, tutorialId });
}
export async function completeTutorialStep(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<OnboardingProgress> {
  return command<OnboardingProgress>('complete_tutorial_step', { userId, tutorialId, stepId });
}
export async function skipTutorialStep(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<OnboardingProgress> {
  return command<OnboardingProgress>('skip_tutorial_step', { userId, tutorialId, stepId });
}
export async function completeTutorial(userId: string, tutorialId: string): Promise<Reward[]> {
  return command<Reward[]>('complete_tutorial', { userId, tutorialId });
}
export async function resetTutorial(userId: string, tutorialId: string): Promise<void> {
  return command<void>('reset_tutorial', { userId, tutorialId });
}
export async function getTutorialProgress(
  userId: string,
  tutorialId: string,
): Promise<OnboardingProgress> {
  return command<OnboardingProgress>('get_tutorial_progress', { userId, tutorialId });
}
export async function getUserTutorialProgress(userId: string): Promise<UserTutorialProgress> {
  return command<UserTutorialProgress>('get_user_tutorial_progress', { userId });
}
export async function getTutorialStats(tutorialId: string): Promise<TutorialStats> {
  return command<TutorialStats>('get_tutorial_stats', { tutorialId });
}
export async function recordStepView(
  userId: string,
  tutorialId: string,
  stepId: string,
): Promise<void> {
  return command<void>('record_step_view', { userId, tutorialId, stepId });
}
export async function getUserRewards(userId: string): Promise<Reward[]> {
  return command<Reward[]>('get_user_rewards', { userId });
}
export async function hasReward(userId: string, rewardId: string): Promise<boolean> {
  return command<boolean>('has_reward', { userId, rewardId });
}
export async function hasUnlockedFeature(userId: string, featureId: string): Promise<boolean> {
  return command<boolean>('has_unlocked_feature', { userId, featureId });
}
export async function getUserCredits(userId: string): Promise<number> {
  return command<number>('get_user_credits', { userId });
}
export async function populateSampleData(userId: string): Promise<SampleDataSummary> {
  return command<SampleDataSummary>('populate_sample_data', { userId });
}
export async function hasSampleData(userId: string): Promise<boolean> {
  return command<boolean>('has_sample_data', { userId });
}
export async function clearSampleData(userId: string): Promise<void> {
  return command<void>('clear_sample_data', { userId });
}
export async function submitTutorialFeedback(
  userId: string,
  tutorialId: string,
  rating: number,
  feedbackText?: string,
  helpful?: boolean,
): Promise<void> {
  return command<void>('submit_tutorial_feedback', {
    userId,
    tutorialId,
    rating,
    feedbackText,
    helpful,
  });
}
export async function recordHelpSession(
  userId: string,
  context: string,
  query?: string,
  helpArticleId?: string,
  wasHelpful?: boolean,
): Promise<void> {
  return command<void>('record_help_session', {
    userId,
    context,
    query,
    helpArticleId,
    wasHelpful,
  });
}
