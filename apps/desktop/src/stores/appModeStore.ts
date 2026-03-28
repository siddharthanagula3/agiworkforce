/**
 * App Mode Store
 *
 * Foundation store for the Dual-Mode Architecture (Local vs Cloud).
 * All mode-gated features read from this store.
 *
 * Persists: mode, planTier, hasOnboarded
 * Not persisted: isOnline (always derived from navigator.onLine at startup)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import { storageFallback } from '../lib/storageFallback';
import { isTauri } from '../lib/tauri-mock';
import { useAuthStore } from './auth';
import { isChatStoreStreaming } from './chat/chatStoreRef';

export type AppMode = 'local' | 'cloud';
export type PlanTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

interface AppModeState {
  mode: AppMode;
  planTier: PlanTier;
  hasOnboarded: boolean;
  hasSelectedMode: boolean;
  isOnline: boolean;

  setMode: (mode: AppMode) => void;
  setPlanTier: (tier: PlanTier) => void;
  completeOnboarding: () => void;
  setHasSelectedMode: (selected: boolean) => void;
  setOnline: (online: boolean) => void;
}

const APP_MODE_STORE_VERSION = 1;

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        mode: isTauri ? 'local' : 'cloud',
        planTier: 'free',
        hasOnboarded: false,
        hasSelectedMode: false,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

        setMode: (mode: AppMode) => {
          // Web mode is always cloud — cannot switch to local
          if (!isTauri && mode === 'local') {
            toast.info('Local mode requires the desktop app');
            return;
          }
          // Block mode switching while chat is actively streaming to avoid mid-stream state
          // inconsistencies.
          if (isChatStoreStreaming()) {
            toast.error('Finish the current response before switching modes');
            return;
          }
          // Cloud mode requires authentication
          if (mode === 'cloud') {
            const isAuthenticated = useAuthStore.getState().isAuthenticated;
            if (!isAuthenticated) {
              toast.error('Sign in to use Cloud mode');
              return;
            }
            set({ mode }, undefined, 'appMode/setMode');
            return;
          }
          set({ mode }, undefined, 'appMode/setMode');
        },

        setPlanTier: (tier: PlanTier) => {
          set({ planTier: tier }, undefined, 'appMode/setPlanTier');
        },

        completeOnboarding: () => {
          set({ hasOnboarded: true }, undefined, 'appMode/completeOnboarding');
        },

        setHasSelectedMode: (selected: boolean) => {
          set({ hasSelectedMode: selected }, undefined, 'appMode/setHasSelectedMode');
        },

        setOnline: (online: boolean) => {
          set({ isOnline: online }, undefined, 'appMode/setOnline');
        },
      })),
      {
        name: 'app-mode-store',
        version: APP_MODE_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          mode: state.mode,
          planTier: state.planTier,
          hasOnboarded: state.hasOnboarded,
          hasSelectedMode: state.hasSelectedMode,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          const state = persistedState as AppModeState;
          // Web builds must always be in cloud mode
          if (!isTauri && state.mode === 'local') {
            return { ...state, mode: 'cloud' };
          }
          return state;
        },
      },
    ),
    { name: 'AppModeStore', enabled: import.meta.env.DEV },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectMode = (state: AppModeState): AppMode => state.mode;
export const selectIsCloud = (state: AppModeState): boolean => state.mode === 'cloud';
export const selectIsLocal = (state: AppModeState): boolean => state.mode === 'local';
export const selectPlanTier = (state: AppModeState): PlanTier => state.planTier;
export const selectHasOnboarded = (state: AppModeState): boolean => state.hasOnboarded;
