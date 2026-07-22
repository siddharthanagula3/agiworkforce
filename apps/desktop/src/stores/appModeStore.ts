/**
 * App Mode Store
 *
 * Foundation store for the Dual-Mode Architecture (Local vs Cloud).
 * All mode-gated features read from this store.
 *
 * Persists: mode, hasOnboarded, hasSelectedMode
 * Not persisted: isOnline (always derived from navigator.onLine at startup)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import type { PrivacyMode } from '@agiworkforce/types';
import { storageFallback } from '../lib/storageFallback';
// Import directly from the zero-import leaf module, not the heavy `tauri-mock`
// barrel: pulling this const through the barrel puts it in an import cycle, so it
// is read (in the zustand initializer below) before the barrel finishes
// initializing → "Cannot access 'supportsLocalAppMode' before initialization".
import { supportsLocalAppMode } from '../lib/runtimeEnvironment';
import { useAuthStore } from './auth';
import { isChatStoreStreaming } from './chat/chatStoreRef';

export type AppMode = 'local' | 'cloud';

interface AppModeState {
  mode: AppMode;
  hasOnboarded: boolean;
  hasSelectedMode: boolean;
  isOnline: boolean;

  setMode: (mode: AppMode) => void;
  completeOnboarding: () => void;
  setHasSelectedMode: (selected: boolean) => void;
  setOnline: (online: boolean) => void;
}

// DCL-4: desktop managed cloud is enabled. An explicit persisted Cloud choice
// now survives reload (App.tsx re-validates the cloud session and prompts
// sign-in if needed). Web builds still normalize to Cloud (no Local runtime).
const APP_MODE_STORE_VERSION = 3;

type PersistedAppModeState = Pick<AppModeState, 'mode' | 'hasOnboarded' | 'hasSelectedMode'>;

function sanitizePersistedAppModeState(value: unknown): PersistedAppModeState {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : Object.create(null);
  let mode: AppMode = raw['mode'] === 'cloud' ? 'cloud' : 'local';

  // Production web builds always use Managed Cloud (no Local runtime there).
  // Desktop defaults to Local but may persist an explicit Cloud choice (DCL-4);
  // App.tsx re-checks the cloud session on load and prompts sign-in if needed.
  if (!supportsLocalAppMode && mode === 'local') mode = 'cloud';

  return {
    mode,
    hasOnboarded: raw['hasOnboarded'] === true,
    hasSelectedMode: raw['hasSelectedMode'] === true,
  };
}

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        mode: supportsLocalAppMode ? 'local' : 'cloud',
        hasOnboarded: false,
        hasSelectedMode: false,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

        setMode: (mode: AppMode) => {
          // Production web mode is always cloud; Tauri and explicit local UI QA builds can use local.
          if (!supportsLocalAppMode && mode === 'local') {
            toast.info('Local mode requires the desktop app');
            return;
          }
          // Block mode switching while chat is actively streaming to avoid mid-stream state
          // inconsistencies.
          if (isChatStoreStreaming()) {
            toast.error('Finish the current response before switching modes');
            return;
          }
          if (mode === 'cloud') {
            // DCL-4: desktop managed cloud is enabled (public alpha). Cloud chat
            // persistence routes through the shared web API boundary via
            // CloudRuntime → getDesktopCloudChatPersistenceClient() (guardedFetch,
            // managed-only), never the fail-closed Rust cloud_* commands. Local +
            // BYOK stay in Local mode and can NEVER reach the cloud client (egress
            // guard + the client's managed-only precondition).
            //
            // Public alpha: Cloud is open to EVERY signed-in account (all tiers,
            // including free, Team, and Enterprise) so users can try it and give
            // feedback. Sign-in is required because cloud persistence is keyed to
            // an account — it is the mechanism, not an access gate. Usage is
            // metered server-side; access is not tier-gated during the alpha.
            const authState = useAuthStore.getState();
            const hasCloudSession = authState.isAuthenticated && !!authState.accessToken;
            if (!hasCloudSession) {
              toast.error('Sign in to use AGI Cloud.');
              return;
            }
            set({ mode }, undefined, 'appMode/setMode');
            return;
          }
          set({ mode }, undefined, 'appMode/setMode');
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
          hasOnboarded: state.hasOnboarded,
          hasSelectedMode: state.hasSelectedMode,
        }),
        migrate: (persistedState: unknown, _version: number) =>
          sanitizePersistedAppModeState(persistedState),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizePersistedAppModeState(persistedState),
        }),
      },
    ),
    { name: 'AppModeStore', enabled: import.meta.env.DEV },
  ),
);

// Prime persistence on first load. zustand `persist` lazy-writes only on the
// first state mutation, so a session that never calls a setter leaves
// `localStorage['app-mode-store']` absent. The shared unified-chat ModelSelector
// detects desktop Local mode by reading that key (readPersistedDesktopMode);
// when it is absent the selector wrongly falls back to the cloud model catalog
// in Local mode (a trust-boundary-confusing label, not an egress breach — the
// guard still blocks the call). A one-time no-op setState forces persist to
// write the current partialized snapshot (mode included) without changing state.
if (typeof window !== 'undefined' && !window.localStorage.getItem('app-mode-store')) {
  useAppModeStore.setState((state) => ({ ...state }));
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectMode = (state: AppModeState): AppMode => state.mode;
export const selectIsCloud = (state: AppModeState): boolean => state.mode === 'cloud';
export const selectIsLocal = (state: AppModeState): boolean => state.mode === 'local';
export const selectHasOnboarded = (state: AppModeState): boolean => state.hasOnboarded;

/**
 * Maps the workspace/storage plane to its privacy mode.
 *
 * Mapping:
 *   'local' → 'local'
 *   'cloud' → 'managed'
 *
 * BYOK is deliberately absent here. It is a per-conversation `executionMode`
 * inside the Local workspace and must never be inferred from global provider
 * settings. A Local -> BYOK transition creates a reviewed conversation fork.
 */
export const selectPrivacyMode = (state: AppModeState): PrivacyMode => {
  return state.mode === 'local' ? 'local' : 'managed';
};
