
import { invoke } from '../lib/tauri-mock';

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
  | 'choose_demo'
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
  average_time_to_value_seconds: number;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  try {
    return await invoke<OnboardingStatus>('get_onboarding_status');
  } catch (error) {
    throw new Error(`Failed to get onboarding status: ${error}`);
  }
}

export async function completeOnboardingStep(stepId: string, data?: string): Promise<void> {
  try {
    await invoke('complete_onboarding_step', { stepId, data: data ?? null });
  } catch (error) {
    throw new Error(`Failed to complete onboarding step "${stepId}": ${error}`);
  }
}

export async function skipOnboardingStep(stepId: string): Promise<void> {
  try {
    await invoke('skip_onboarding_step', { stepId });
  } catch (error) {
    throw new Error(`Failed to skip onboarding step "${stepId}": ${error}`);
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    await invoke('reset_onboarding');
  } catch (error) {
    throw new Error(`Failed to reset onboarding: ${error}`);
  }
}

export async function exportUserData(): Promise<string> {
  try {
    return await invoke<string>('export_user_data');
  } catch (error) {
    throw new Error(`Failed to export user data: ${error}`);
  }
}

export async function checkConnectivity(): Promise<boolean> {
  try {
    return await invoke<boolean>('check_connectivity');
  } catch (error) {
    throw new Error(`Failed to check connectivity: ${error}`);
  }
}

export async function getSessionInfo(): Promise<SessionInfo> {
  try {
    return await invoke<SessionInfo>('get_session_info');
  } catch (error) {
    throw new Error(`Failed to get session info: ${error}`);
  }
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await invoke('update_session_activity', { sessionId });
  } catch (error) {
    throw new Error(`Failed to update session activity: ${error}`);
  }
}

export async function getUserPreference(key: string): Promise<UserPreference | null> {
  try {
    return await invoke<UserPreference | null>('get_user_preference', { key });
  } catch (error) {
    throw new Error(`Failed to get user preference "${key}": ${error}`);
  }
}

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

export async function hasCompletedFirstRun(userId: string): Promise<boolean> {
  try {
    return await invoke<boolean>('has_completed_first_run', { userId });
  } catch (error) {
    throw new Error(`Failed to check first-run completion: ${error}`);
  }
}

export async function runInstantDemo(demoId: string, userId?: string): Promise<DemoResult> {
  try {
    return await invoke<DemoResult>('run_instant_demo', {
      demoId,
      userId: userId ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to run instant demo: ${error}`);
  }
}

export async function updateFirstRunStep(sessionId: string, step: FirstRunStep): Promise<void> {
  try {
    await invoke('update_first_run_step', { sessionId, step });
  } catch (error) {
    throw new Error(`Failed to update first-run step: ${error}`);
  }
}

export async function selectDemo(sessionId: string, demoId: string): Promise<void> {
  try {
    await invoke('select_demo', { sessionId, demoId });
  } catch (error) {
    throw new Error(`Failed to select demo: ${error}`);
  }
}

export async function recordDemoResults(sessionId: string, results: DemoResult): Promise<void> {
  try {
    await invoke('record_demo_results', { sessionId, results });
  } catch (error) {
    throw new Error(`Failed to record demo results: ${error}`);
  }
}

export async function completeFirstRun(sessionId: string): Promise<void> {
  try {
    await invoke('complete_first_run', { sessionId });
  } catch (error) {
    throw new Error(`Failed to complete first-run: ${error}`);
  }
}

export async function getFirstRunSession(sessionId: string): Promise<FirstRunSession> {
  try {
    return await invoke<FirstRunSession>('get_first_run_session', { sessionId });
  } catch (error) {
    throw new Error(`Failed to get first-run session: ${error}`);
  }
}

export async function getFirstRunStatistics(): Promise<FirstRunStatistics> {
  try {
    return await invoke<FirstRunStatistics>('get_first_run_statistics');
  } catch (error) {
    throw new Error(`Failed to get first-run statistics: ${error}`);
  }
}

export async function skipFirstRun(sessionId: string): Promise<void> {
  try {
    await invoke('skip_first_run', { sessionId });
  } catch (error) {
    throw new Error(`Failed to skip first-run: ${error}`);
  }
}

export const OnboardingClient = {
  getStatus: getOnboardingStatus,
  completeStep: completeOnboardingStep,
  skipStep: skipOnboardingStep,
  reset: resetOnboarding,

  exportData: exportUserData,

  checkConnectivity,

  getSession: getSessionInfo,
  updateActivity: updateSessionActivity,

  getPreference: getUserPreference,
  setPreference: setUserPreference,

  firstRun: {
    start: startFirstRunExperience,
    hasCompleted: hasCompletedFirstRun,
    runDemo: runInstantDemo,
    updateStep: updateFirstRunStep,
    selectDemo,
    recordResults: recordDemoResults,
    complete: completeFirstRun,
    getSession: getFirstRunSession,
    getStatistics: getFirstRunStatistics,
    skip: skipFirstRun,
  },
} as const;
