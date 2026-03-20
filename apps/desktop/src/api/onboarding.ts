/**
 * Onboarding API — Tauri command wrappers for onboarding.rs
 *
 * Covers all 21 commands:
 *   get_onboarding_status, complete_onboarding_step, skip_onboarding_step,
 *   reset_onboarding, export_user_data, check_connectivity,
 *   get_session_info, update_session_activity,
 *   get_user_preference, set_user_preference,
 *   start_first_run_experience, has_completed_first_run, run_instant_demo,
 *   update_first_run_step, select_demo, record_demo_results,
 *   mark_setup_completed, complete_first_run, get_first_run_session,
 *   get_first_run_statistics, skip_first_run
 */

import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types (mirrors Rust structs in sys/commands/onboarding.rs + ui/onboarding/)
// =============================================================================

export interface OnboardingStep {
  id: number;
  stepId: string;
  stepName: string;
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  data: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface OnboardingStatus {
  completed: boolean;
  progressPercent: number;
  totalSteps: number;
  completedSteps: number;
  steps: OnboardingStep[];
}

export interface SessionInfo {
  id: string;
  startedAt: number;
  lastActivity: number;
  idleTimeoutMinutes: number;
  autoLockEnabled: boolean;
  lockedAt: number | null;
}

export interface UserPreference {
  value: string;
  type: 'string' | 'boolean' | 'number' | 'json';
}

export type FirstRunStep =
  | 'welcome'
  | 'choose_employee'
  | 'running_demo'
  | 'viewing_results'
  | 'quick_setup'
  | 'assign_first_task'
  | 'completed';

export interface FirstRunSession {
  id: string;
  user_id: string;
  step: string;
  recommended_demos: Array<{ id: string; name: string; description: string }>;
  demo_results: DemoResult | null;
  time_to_value_seconds: number;
  selected_demo_id: string | null;
  started_at: number;
}

export interface DemoResult {
  demo_id: string;
  demo_name: string;
  task_description: string;
  input_summary: string;
  output_summary: string;
  actions_taken: string[];
  time_saved_minutes: number;
  cost_saved_usd: number;
  quality_score: number;
  completion_time_seconds: number;
}

export interface FirstRunStatistics {
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  hired_count: number;
  hire_rate: number;
  average_time_to_value_seconds: number;
}

// =============================================================================
// Onboarding Progress Commands
// =============================================================================

/** Get onboarding status with all steps and progress. */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  try {
    return await invoke<OnboardingStatus>('get_onboarding_status');
  } catch (error) {
    throw new Error(`Failed to get onboarding status: ${error}`);
  }
}

/** Mark a specific onboarding step as completed. */
export async function completeOnboardingStep(stepId: string, data?: string): Promise<void> {
  try {
    await invoke('complete_onboarding_step', { stepId, data: data ?? null });
  } catch (error) {
    throw new Error(`Failed to complete onboarding step "${stepId}": ${error}`);
  }
}

/** Skip a specific onboarding step. */
export async function skipOnboardingStep(stepId: string): Promise<void> {
  try {
    await invoke('skip_onboarding_step', { stepId });
  } catch (error) {
    throw new Error(`Failed to skip onboarding step "${stepId}": ${error}`);
  }
}

/** Reset all onboarding progress. */
export async function resetOnboarding(): Promise<void> {
  try {
    await invoke('reset_onboarding');
  } catch (error) {
    throw new Error(`Failed to reset onboarding: ${error}`);
  }
}

// =============================================================================
// Data Export
// =============================================================================

/** Export all user data (conversations, messages, settings) as JSON string. */
export async function exportUserData(): Promise<string> {
  try {
    return await invoke<string>('export_user_data');
  } catch (error) {
    throw new Error(`Failed to export user data: ${error}`);
  }
}

// =============================================================================
// Connectivity
// =============================================================================

/** Check internet connectivity by resolving a known host. */
export async function checkConnectivity(): Promise<boolean> {
  try {
    return await invoke<boolean>('check_connectivity');
  } catch (error) {
    throw new Error(`Failed to check connectivity: ${error}`);
  }
}

// =============================================================================
// Session Management
// =============================================================================

/** Get or create the current user session. */
export async function getSessionInfo(): Promise<SessionInfo> {
  try {
    return await invoke<SessionInfo>('get_session_info');
  } catch (error) {
    throw new Error(`Failed to get session info: ${error}`);
  }
}

/** Touch session last_activity timestamp. */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await invoke('update_session_activity', { sessionId });
  } catch (error) {
    throw new Error(`Failed to update session activity: ${error}`);
  }
}

// =============================================================================
// User Preferences
// =============================================================================

/** Read a single user preference by key. Returns null if not found. */
export async function getUserPreference(key: string): Promise<UserPreference | null> {
  try {
    return await invoke<UserPreference | null>('get_user_preference', { key });
  } catch (error) {
    throw new Error(`Failed to get user preference "${key}": ${error}`);
  }
}

/** Upsert a user preference. */
export async function setUserPreference(
  key: string,
  value: string,
  category: string,
  dataType: string,
  description?: string,
): Promise<void> {
  try {
    await invoke('set_user_preference', {
      key,
      value,
      category,
      dataType,
      description: description ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to set user preference "${key}": ${error}`);
  }
}

// =============================================================================
// First-Run Experience
// =============================================================================

/** Start the first-run onboarding flow for a user. */
export async function startFirstRunExperience(
  userId: string,
  userRole?: string,
): Promise<FirstRunSession> {
  try {
    return await invoke<FirstRunSession>('start_first_run_experience', {
      userId,
      userRole: userRole ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to start first-run experience: ${error}`);
  }
}

/** Check if a user has completed the first-run flow. */
export async function hasCompletedFirstRun(userId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('has_completed_first_run', { userId });
  } catch (error) {
    throw new Error(`Failed to check first-run completion: ${error}`);
  }
}

/** Run an instant demo for a specific employee. */
export async function runInstantDemo(
  employeeId: string,
  userId?: string,
): Promise<DemoResult> {
  try {
    return await invoke<DemoResult>('run_instant_demo', {
      employeeId,
      userId: userId ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to run instant demo: ${error}`);
  }
}

/** Advance the first-run step to a new stage. */
export async function updateFirstRunStep(
  sessionId: string,
  step: FirstRunStep,
): Promise<void> {
  try {
    await invoke('update_first_run_step', { sessionId, step });
  } catch (error) {
    throw new Error(`Failed to update first-run step: ${error}`);
  }
}

/** Select a demo in the first-run flow. */
export async function selectDemo(sessionId: string, demoId: string): Promise<void> {
  try {
    await invoke('select_demo', { sessionId, demoId });
  } catch (error) {
    throw new Error(`Failed to select demo: ${error}`);
  }
}

/** Persist demo results for a first-run session. */
export async function recordDemoResults(
  sessionId: string,
  results: DemoResult,
): Promise<void> {
  try {
    await invoke('record_demo_results', { sessionId, results });
  } catch (error) {
    throw new Error(`Failed to record demo results: ${error}`);
  }
}

/** Mark the quick-setup phase as completed. */
export async function markSetupCompleted(sessionId: string): Promise<void> {
  try {
    await invoke('mark_setup_completed', { sessionId });
  } catch (error) {
    throw new Error(`Failed to mark setup completed: ${error}`);
  }
}

/** Complete the entire first-run flow. */
export async function completeFirstRun(sessionId: string): Promise<void> {
  try {
    await invoke('complete_first_run', { sessionId });
  } catch (error) {
    throw new Error(`Failed to complete first-run: ${error}`);
  }
}

/** Get a first-run session by ID. */
export async function getFirstRunSession(sessionId: string): Promise<FirstRunSession> {
  try {
    return await invoke<FirstRunSession>('get_first_run_session', { sessionId });
  } catch (error) {
    throw new Error(`Failed to get first-run session: ${error}`);
  }
}

/** Get aggregate first-run statistics. */
export async function getFirstRunStatistics(): Promise<FirstRunStatistics> {
  try {
    return await invoke<FirstRunStatistics>('get_first_run_statistics');
  } catch (error) {
    throw new Error(`Failed to get first-run statistics: ${error}`);
  }
}

/** Skip the first-run flow entirely. */
export async function skipFirstRun(sessionId: string): Promise<void> {
  try {
    await invoke('skip_first_run', { sessionId });
  } catch (error) {
    throw new Error(`Failed to skip first-run: ${error}`);
  }
}

// =============================================================================
// Client object for structured access
// =============================================================================

export const OnboardingClient = {
  // Progress
  getStatus: getOnboardingStatus,
  completeStep: completeOnboardingStep,
  skipStep: skipOnboardingStep,
  reset: resetOnboarding,

  // Data
  exportData: exportUserData,

  // Connectivity
  checkConnectivity,

  // Session
  getSession: getSessionInfo,
  updateActivity: updateSessionActivity,

  // Preferences
  getPreference: getUserPreference,
  setPreference: setUserPreference,

  // First-Run
  firstRun: {
    start: startFirstRunExperience,
    hasCompleted: hasCompletedFirstRun,
    runDemo: runInstantDemo,
    updateStep: updateFirstRunStep,
    selectDemo,
    recordResults: recordDemoResults,
    markSetupDone: markSetupCompleted,
    complete: completeFirstRun,
    getSession: getFirstRunSession,
    getStatistics: getFirstRunStatistics,
    skip: skipFirstRun,
  },
} as const;
