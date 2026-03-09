/**
 * Execution Preferences Store
 *
 * Manages task execution preferences: timeouts, checkpointing,
 * auto-resume, and timeout warnings.
 *
 * Middleware: devtools(persist(subscribeWithSelector(...)))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionPreferences {
  /** Maximum task timeout in minutes (1-4320, default 1440=24hrs) */
  maxTimeoutMinutes: number;
  /** Enable automatic checkpointing of task progress */
  enableCheckpointing: boolean;
  /** Interval between checkpoints in steps (default 5) */
  checkpointInterval: number;
  /** Enable task resumption after app restart */
  autoResumeOnRestart: boolean;
  /** Show timeout warnings at 1hr, 30min, 5min remaining */
  enableTimeoutWarnings: boolean;
}

interface ExecutionPreferencesState {
  executionPreferences: ExecutionPreferences;
}

interface ExecutionPreferencesActions {
  setMaxTimeoutMinutes: (minutes: number) => void;
  setEnableCheckpointing: (enabled: boolean) => void;
  setCheckpointInterval: (interval: number) => void;
  setAutoResumeOnRestart: (enabled: boolean) => void;
  setEnableTimeoutWarnings: (enabled: boolean) => void;
}

export type ExecutionPreferencesStore = ExecutionPreferencesState & ExecutionPreferencesActions;

// ============================================================================
// Defaults
// ============================================================================

export const defaultExecutionPreferences: ExecutionPreferences = {
  maxTimeoutMinutes: 1440,
  enableCheckpointing: true,
  checkpointInterval: 5,
  autoResumeOnRestart: true,
  enableTimeoutWarnings: true,
};

// ============================================================================
// Store
// ============================================================================

export const useExecutionPreferencesStore = create<ExecutionPreferencesStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        executionPreferences: { ...defaultExecutionPreferences },

        setMaxTimeoutMinutes: (minutes: number) => {
          const clamped = Math.max(1, Math.min(4320, minutes));
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, maxTimeoutMinutes: clamped },
            }),
            undefined,
            'executionPreferences/setMaxTimeoutMinutes',
          );
        },

        setEnableCheckpointing: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: { ...state.executionPreferences, enableCheckpointing: enabled },
            }),
            undefined,
            'executionPreferences/setEnableCheckpointing',
          );
        },

        setCheckpointInterval: (interval: number) => {
          const clamped = Math.max(1, Math.min(100, interval));
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                checkpointInterval: clamped,
              },
            }),
            undefined,
            'executionPreferences/setCheckpointInterval',
          );
        },

        setAutoResumeOnRestart: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                autoResumeOnRestart: enabled,
              },
            }),
            undefined,
            'executionPreferences/setAutoResumeOnRestart',
          );
        },

        setEnableTimeoutWarnings: (enabled: boolean) => {
          set(
            (state) => ({
              executionPreferences: {
                ...state.executionPreferences,
                enableTimeoutWarnings: enabled,
              },
            }),
            undefined,
            'executionPreferences/setEnableTimeoutWarnings',
          );
        },
      })),
      {
        name: 'agiworkforce-execution-preferences',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          executionPreferences: state.executionPreferences,
        }),
      },
    ),
    { name: 'ExecutionPreferencesStore', enabled: import.meta.env.DEV },
  ),
);
