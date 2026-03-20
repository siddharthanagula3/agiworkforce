/**
 * Onboarding Store
 *
 * Wires all onboarding and first-run Tauri commands to the frontend.
 *
 * Covered commands (sys/commands/onboarding.rs):
 *   get_onboarding_status      -- get all onboarding steps + progress
 *   complete_onboarding_step   -- mark a step as completed
 *   skip_onboarding_step       -- mark a step as skipped
 *   reset_onboarding           -- reset all onboarding progress
 *   export_user_data           -- export conversations, messages, settings as JSON
 *   check_connectivity         -- internet reachability check
 *   get_session_info           -- current user session metadata
 *   update_session_activity    -- touch session last_activity timestamp
 *   get_user_preference        -- read a single user preference by key
 *   set_user_preference        -- upsert a user preference
 *   start_first_run_experience -- start the first-run onboarding flow
 *   has_completed_first_run    -- check if user has finished first-run
 *   run_instant_demo           -- run an instant demo for an employee
 *   update_first_run_step      -- advance the first-run step
 *   select_demo                -- select a demo in the first-run flow
 *   record_demo_results        -- persist demo results
 *   mark_setup_completed       -- mark quick-setup as done
 *   complete_first_run         -- complete the entire first-run flow
 *   get_first_run_session      -- get a first-run session by ID
 *   get_first_run_statistics   -- aggregate first-run stats
 *   skip_first_run             -- skip the first-run flow entirely
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { storageFallback } from '../lib/storageFallback';
import {
  getOnboardingStatus,
  completeOnboardingStep,
  skipOnboardingStep,
  resetOnboarding as resetOnboardingApi,
  exportUserData,
  checkConnectivity,
  getSessionInfo,
  updateSessionActivity as updateSessionActivityApi,
  getUserPreference,
  setUserPreference,
  startFirstRunExperience,
  hasCompletedFirstRun,
  runInstantDemo,
  updateFirstRunStep,
  selectDemo,
  recordDemoResults,
  markSetupCompleted,
  completeFirstRun,
  getFirstRunSession,
  getFirstRunStatistics,
  skipFirstRun,
} from '../api/onboarding';
// Re-export types from the API layer for backward compatibility
export type {
  OnboardingStep,
  OnboardingStatus,
  SessionInfo,
  UserPreference,
  FirstRunStep,
  FirstRunSession,
  DemoResult,
  FirstRunStatistics,
} from '../api/onboarding';

import type {
  OnboardingStatus,
  SessionInfo,
  UserPreference,
  FirstRunStep,
  FirstRunSession,
  DemoResult,
  FirstRunStatistics,
} from '../api/onboarding';

// =============================================================================
// Store State
// =============================================================================

interface OnboardingStoreState {
  // Onboarding progress
  status: OnboardingStatus | null;
  isLoading: boolean;
  error: string | null;

  // Session
  session: SessionInfo | null;

  // First-run
  firstRunSession: FirstRunSession | null;
  firstRunCompleted: boolean;
  firstRunStats: FirstRunStatistics | null;

  // Connectivity
  isOnline: boolean;

  // Actions — Onboarding Progress
  fetchOnboardingStatus: () => Promise<OnboardingStatus | null>;
  completeStep: (stepId: string, data?: string) => Promise<boolean>;
  skipStep: (stepId: string) => Promise<boolean>;
  resetOnboarding: () => Promise<boolean>;

  // Actions — Data Export
  exportUserData: () => Promise<string | null>;

  // Actions — Connectivity
  checkConnectivity: () => Promise<boolean>;

  // Actions — Session
  fetchSessionInfo: () => Promise<SessionInfo | null>;
  updateSessionActivity: (sessionId: string) => Promise<boolean>;

  // Actions — User Preferences
  getUserPreference: (key: string) => Promise<UserPreference | null>;
  setUserPreference: (
    key: string,
    value: string,
    category: string,
    dataType: string,
    description?: string,
  ) => Promise<boolean>;

  // Actions — First-Run Experience
  startFirstRun: (userId: string, userRole?: string) => Promise<FirstRunSession | null>;
  hasCompletedFirstRun: (userId: string) => Promise<boolean>;
  runInstantDemo: (employeeId: string, userId?: string) => Promise<DemoResult | null>;
  updateFirstRunStep: (sessionId: string, step: FirstRunStep) => Promise<boolean>;
  selectDemo: (sessionId: string, demoId: string) => Promise<boolean>;
  recordDemoResults: (sessionId: string, results: DemoResult) => Promise<boolean>;
  markSetupCompleted: (sessionId: string) => Promise<boolean>;
  completeFirstRun: (sessionId: string) => Promise<boolean>;
  getFirstRunSession: (sessionId: string) => Promise<FirstRunSession | null>;
  fetchFirstRunStatistics: () => Promise<FirstRunStatistics | null>;
  skipFirstRun: (sessionId: string) => Promise<boolean>;

  // Utility
  clearError: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useOnboardingStore = create<OnboardingStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        status: null,
        isLoading: false,
        error: null,
        session: null,
        firstRunSession: null,
        firstRunCompleted: false,
        firstRunStats: null,
        isOnline: true,

        // =====================================================================
        // Onboarding Progress
        // =====================================================================

        fetchOnboardingStatus: async () => {
          set(
            (state) => {
              state.isLoading = true;
              state.error = null;
            },
            undefined,
            'onboarding/fetchStatus/start',
          );
          try {
            const status = await getOnboardingStatus();
            set(
              (state) => {
                state.status = status;
                state.isLoading = false;
              },
              undefined,
              'onboarding/fetchStatus/done',
            );
            return status;
          } catch (err) {
            const msg = String(err);
            set(
              (state) => {
                state.error = msg;
                state.isLoading = false;
              },
              undefined,
              'onboarding/fetchStatus/error',
            );
            return null;
          }
        },

        completeStep: async (stepId, data) => {
          try {
            await completeOnboardingStep(stepId, data ?? undefined);
            // Optimistically update local state
            set(
              (state) => {
                if (state.status) {
                  const step = state.status.steps.find((s) => s.stepId === stepId);
                  if (step) {
                    step.completed = true;
                    step.completedAt = Date.now();
                    if (data) step.data = data;
                  }
                  state.status.completedSteps = state.status.steps.filter(
                    (s) => s.completed || s.skipped,
                  ).length;
                  state.status.progressPercent =
                    state.status.totalSteps > 0
                      ? (state.status.completedSteps / state.status.totalSteps) * 100
                      : 0;
                  state.status.completed = state.status.completedSteps === state.status.totalSteps;
                }
              },
              undefined,
              'onboarding/completeStep/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/completeStep/error',
            );
            return false;
          }
        },

        skipStep: async (stepId) => {
          try {
            await skipOnboardingStep(stepId);
            set(
              (state) => {
                if (state.status) {
                  const step = state.status.steps.find((s) => s.stepId === stepId);
                  if (step) {
                    step.skipped = true;
                  }
                  state.status.completedSteps = state.status.steps.filter(
                    (s) => s.completed || s.skipped,
                  ).length;
                  state.status.progressPercent =
                    state.status.totalSteps > 0
                      ? (state.status.completedSteps / state.status.totalSteps) * 100
                      : 0;
                  state.status.completed = state.status.completedSteps === state.status.totalSteps;
                }
              },
              undefined,
              'onboarding/skipStep/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/skipStep/error',
            );
            return false;
          }
        },

        resetOnboarding: async () => {
          try {
            await resetOnboardingApi();
            set(
              (state) => {
                if (state.status) {
                  for (const step of state.status.steps) {
                    step.completed = false;
                    step.skipped = false;
                    step.completedAt = null;
                    step.data = null;
                  }
                  state.status.completedSteps = 0;
                  state.status.progressPercent = 0;
                  state.status.completed = false;
                }
              },
              undefined,
              'onboarding/reset/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/reset/error',
            );
            return false;
          }
        },

        // =====================================================================
        // Data Export
        // =====================================================================

        exportUserData: async () => {
          set(
            (state) => {
              state.isLoading = true;
            },
            undefined,
            'onboarding/export/start',
          );
          try {
            const data = await exportUserData();
            set(
              (state) => {
                state.isLoading = false;
              },
              undefined,
              'onboarding/export/done',
            );
            return data;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
                state.isLoading = false;
              },
              undefined,
              'onboarding/export/error',
            );
            return null;
          }
        },

        // =====================================================================
        // Connectivity
        // =====================================================================

        checkConnectivity: async () => {
          try {
            const online = await checkConnectivity();
            set(
              (state) => {
                state.isOnline = online;
              },
              undefined,
              'onboarding/connectivity/done',
            );
            return online;
          } catch (err) {
            set(
              (state) => {
                state.isOnline = false;
                state.error = String(err);
              },
              undefined,
              'onboarding/connectivity/error',
            );
            return false;
          }
        },

        // =====================================================================
        // Session
        // =====================================================================

        fetchSessionInfo: async () => {
          try {
            const session = await getSessionInfo();
            set(
              (state) => {
                state.session = session;
              },
              undefined,
              'onboarding/session/done',
            );
            return session;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/session/error',
            );
            return null;
          }
        },

        updateSessionActivity: async (sessionId) => {
          try {
            await updateSessionActivityApi(sessionId);
            set(
              (state) => {
                if (state.session && state.session.id === sessionId) {
                  state.session.lastActivity = Date.now();
                }
              },
              undefined,
              'onboarding/sessionActivity/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/sessionActivity/error',
            );
            return false;
          }
        },

        // =====================================================================
        // User Preferences
        // =====================================================================

        getUserPreference: async (key) => {
          try {
            const result = await getUserPreference(key);
            return result;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/getPref/error',
            );
            return null;
          }
        },

        setUserPreference: async (key, value, category, dataType, description) => {
          try {
            await setUserPreference(key, value, category, dataType, description ?? undefined);
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/setPref/error',
            );
            return false;
          }
        },

        // =====================================================================
        // First-Run Experience
        // =====================================================================

        startFirstRun: async (userId, userRole) => {
          set(
            (state) => {
              state.isLoading = true;
              state.error = null;
            },
            undefined,
            'onboarding/firstRun/start',
          );
          try {
            const session = await startFirstRunExperience(userId, userRole ?? undefined);
            set(
              (state) => {
                state.firstRunSession = session;
                state.isLoading = false;
              },
              undefined,
              'onboarding/firstRun/started',
            );
            return session;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
                state.isLoading = false;
              },
              undefined,
              'onboarding/firstRun/error',
            );
            return null;
          }
        },

        hasCompletedFirstRun: async (userId) => {
          try {
            const completed = await hasCompletedFirstRun(userId);
            set(
              (state) => {
                state.firstRunCompleted = completed;
              },
              undefined,
              'onboarding/hasCompleted/done',
            );
            return completed;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/hasCompleted/error',
            );
            return false;
          }
        },

        runInstantDemo: async (employeeId, userId) => {
          set(
            (state) => {
              state.isLoading = true;
            },
            undefined,
            'onboarding/demo/start',
          );
          try {
            const result = await runInstantDemo(employeeId, userId ?? undefined);
            set(
              (state) => {
                state.isLoading = false;
              },
              undefined,
              'onboarding/demo/done',
            );
            return result;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
                state.isLoading = false;
              },
              undefined,
              'onboarding/demo/error',
            );
            return null;
          }
        },

        updateFirstRunStep: async (sessionId, step) => {
          try {
            await updateFirstRunStep(sessionId, step);
            set(
              (state) => {
                if (state.firstRunSession && state.firstRunSession.id === sessionId) {
                  state.firstRunSession.step = step;
                }
              },
              undefined,
              'onboarding/firstRunStep/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/firstRunStep/error',
            );
            return false;
          }
        },

        selectDemo: async (sessionId, demoId) => {
          try {
            await selectDemo(sessionId, demoId);
            set(
              (state) => {
                if (state.firstRunSession && state.firstRunSession.id === sessionId) {
                  state.firstRunSession.selected_demo_id = demoId;
                }
              },
              undefined,
              'onboarding/selectDemo/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/selectDemo/error',
            );
            return false;
          }
        },

        recordDemoResults: async (sessionId, results) => {
          try {
            await recordDemoResults(sessionId, results);
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/recordResults/error',
            );
            return false;
          }
        },

        markSetupCompleted: async (sessionId) => {
          try {
            await markSetupCompleted(sessionId);
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/markSetup/error',
            );
            return false;
          }
        },

        completeFirstRun: async (sessionId) => {
          try {
            await completeFirstRun(sessionId);
            set(
              (state) => {
                state.firstRunCompleted = true;
                if (state.firstRunSession && state.firstRunSession.id === sessionId) {
                  state.firstRunSession.step = 'completed';
                }
              },
              undefined,
              'onboarding/completeFirstRun/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/completeFirstRun/error',
            );
            return false;
          }
        },

        getFirstRunSession: async (sessionId) => {
          try {
            const session = await getFirstRunSession(sessionId);
            set(
              (state) => {
                state.firstRunSession = session;
              },
              undefined,
              'onboarding/getSession/done',
            );
            return session;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/getSession/error',
            );
            return null;
          }
        },

        fetchFirstRunStatistics: async () => {
          try {
            const stats = await getFirstRunStatistics();
            set(
              (state) => {
                state.firstRunStats = stats;
              },
              undefined,
              'onboarding/stats/done',
            );
            return stats;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/stats/error',
            );
            return null;
          }
        },

        skipFirstRun: async (sessionId) => {
          try {
            await skipFirstRun(sessionId);
            set(
              (state) => {
                state.firstRunCompleted = true;
              },
              undefined,
              'onboarding/skipFirstRun/done',
            );
            return true;
          } catch (err) {
            set(
              (state) => {
                state.error = String(err);
              },
              undefined,
              'onboarding/skipFirstRun/error',
            );
            return false;
          }
        },

        // =====================================================================
        // Utility
        // =====================================================================

        clearError: () =>
          set(
            (state) => {
              state.error = null;
            },
            undefined,
            'onboarding/clearError',
          ),
      })),
      {
        name: 'agiworkforce-onboarding',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          firstRunCompleted: state.firstRunCompleted,
          status: state.status,
        }),
      },
    ),
    { name: 'OnboardingStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectOnboardingStatus = (state: OnboardingStoreState) => state.status;
export const selectOnboardingLoading = (state: OnboardingStoreState) => state.isLoading;
export const selectOnboardingError = (state: OnboardingStoreState) => state.error;
export const selectOnboardingProgress = (state: OnboardingStoreState) =>
  state.status?.progressPercent ?? 0;
export const selectOnboardingCompleted = (state: OnboardingStoreState) =>
  state.status?.completed ?? false;
export const selectSessionInfo = (state: OnboardingStoreState) => state.session;
export const selectIsOnline = (state: OnboardingStoreState) => state.isOnline;
export const selectFirstRunSession = (state: OnboardingStoreState) => state.firstRunSession;
export const selectFirstRunCompleted = (state: OnboardingStoreState) => state.firstRunCompleted;
export const selectFirstRunStats = (state: OnboardingStoreState) => state.firstRunStats;
