/**
 * Security Preferences Store
 *
 * Manages allowed directories for file operations and feature capability toggles.
 *
 * Middleware: devtools(persist(subscribeWithSelector(...)))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

interface SecurityPreferencesState {
  allowedDirectories: string[];
  features: Record<string, boolean>;
}

interface SecurityPreferencesActions {
  addAllowedDirectory: (path: string) => void;
  removeAllowedDirectory: (path: string) => void;
  setAllowedDirectories: (paths: string[]) => void;
  setFeature: (key: string, enabled: boolean) => void;
}

export type SecurityPreferencesStore = SecurityPreferencesState & SecurityPreferencesActions;

// ============================================================================
// Store
// ============================================================================

export const useSecurityPreferencesStore = create<SecurityPreferencesStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        allowedDirectories: [],
        features: {},

        addAllowedDirectory: (path: string) => {
          set(
            (state) => {
              if (state.allowedDirectories.includes(path)) return {};
              return { allowedDirectories: [...state.allowedDirectories, path] };
            },
            undefined,
            'securityPreferences/addAllowedDirectory',
          );
        },

        removeAllowedDirectory: (path: string) => {
          set(
            (state) => ({
              allowedDirectories: state.allowedDirectories.filter((p) => p !== path),
            }),
            undefined,
            'securityPreferences/removeAllowedDirectory',
          );
        },

        setAllowedDirectories: (paths: string[]) => {
          set(
            { allowedDirectories: paths },
            undefined,
            'securityPreferences/setAllowedDirectories',
          );
        },

        setFeature: (key: string, enabled: boolean) => {
          set(
            (state) => ({ features: { ...state.features, [key]: enabled } }),
            undefined,
            'securityPreferences/setFeature',
          );
        },
      })),
      {
        name: 'agiworkforce-security-preferences',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          allowedDirectories: state.allowedDirectories,
          features: state.features,
        }),
      },
    ),
    { name: 'SecurityPreferencesStore', enabled: import.meta.env.DEV },
  ),
);
