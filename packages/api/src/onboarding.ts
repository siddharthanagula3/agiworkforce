/**
 * Onboarding API — typed wrappers for onboarding and first-run experience commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface OnboardingStatus {
  completed: boolean;
  currentStep: string;
  steps: { id: string; completed: boolean }[];
}
export interface FirstRunSession {
  id: string;
  userId: string;
  currentStep: string;
  startedAt: string;
  [key: string]: unknown;
}
export interface FirstRunStatistics {
  totalUsers: number;
  completionRate: number;
  avgDuration: number;
}
export interface DemoResult {
  success: boolean;
  duration: number;
  [key: string]: unknown;
}

// ---- Commands ----

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return command<OnboardingStatus>('get_onboarding_status');
}
export async function completeOnboardingStep(stepId: string, data?: string): Promise<void> {
  return command<void>('complete_onboarding_step', { stepId, data });
}
export async function skipOnboardingStep(stepId: string): Promise<void> {
  return command<void>('skip_onboarding_step', { stepId });
}
export async function resetOnboarding(): Promise<void> {
  return command<void>('reset_onboarding');
}
export async function exportUserData(): Promise<string> {
  return command<string>('export_user_data');
}
export async function checkConnectivity(): Promise<boolean> {
  return command<boolean>('check_connectivity');
}
export async function getSessionInfo(): Promise<unknown> {
  return command<unknown>('get_session_info');
}
export async function updateSessionActivity(sessionId: string): Promise<void> {
  return command<void>('update_session_activity', { sessionId });
}
export async function getUserPreference(key: string): Promise<unknown> {
  return command<unknown>('get_user_preference', { key });
}
export async function setUserPreference(
  key: string,
  value: string,
  category: string,
  dataType: string,
  description?: string,
): Promise<void> {
  return command<void>('set_user_preference', { key, value, category, dataType, description });
}
export async function startFirstRunExperience(
  userId: string,
  userRole?: string,
): Promise<FirstRunSession> {
  return command<FirstRunSession>('start_first_run_experience', { userId, userRole });
}
export async function hasCompletedFirstRun(userId: string): Promise<boolean> {
  return command<boolean>('has_completed_first_run', { userId });
}
export async function runInstantDemo(employeeId: string, userId?: string): Promise<DemoResult> {
  return command<DemoResult>('run_instant_demo', { employeeId, userId });
}
export async function updateFirstRunStep(sessionId: string, step: string): Promise<void> {
  return command<void>('update_first_run_step', { sessionId, step });
}
export async function selectDemo(sessionId: string, demoId: string): Promise<void> {
  return command<void>('select_demo', { sessionId, demoId });
}
export async function recordDemoResults(sessionId: string, results: DemoResult): Promise<void> {
  return command<void>('record_demo_results', { sessionId, results });
}
export async function markSetupCompleted(sessionId: string): Promise<void> {
  return command<void>('mark_setup_completed', { sessionId });
}
export async function completeFirstRun(sessionId: string): Promise<void> {
  return command<void>('complete_first_run', { sessionId });
}
export async function getFirstRunSession(sessionId: string): Promise<FirstRunSession> {
  return command<FirstRunSession>('get_first_run_session', { sessionId });
}
export async function getFirstRunStatistics(): Promise<FirstRunStatistics> {
  return command<FirstRunStatistics>('get_first_run_statistics');
}
export async function skipFirstRun(sessionId: string): Promise<void> {
  return command<void>('skip_first_run', { sessionId });
}
