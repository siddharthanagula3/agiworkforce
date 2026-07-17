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
import { DESKTOP_CLOUD_COMING_SOON } from '../constants/cloudAvailability';
import { useAuthStore } from './auth';
import { isChatStoreStreaming } from './chat/chatStoreRef';

export type AppMode = 'local' | 'cloud';
import type { PlanTier } from '../lib/cloudAccountTypes';

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

// v2 (PA-3): force the desktop runtime out of any stale persisted Cloud mode.
// Desktop managed cloud is not implemented yet, so a Cloud mode persisted by an
// earlier build must not survive a reload (it would route chat persistence into
// the unimplemented Rust command). See migrate() below.
const APP_MODE_STORE_VERSION = 3;
const CLOUD_MANAGED_TIERS: ReadonlySet<PlanTier> = new Set(['basic', 'pro', 'max', 'enterprise']);

type PersistedAppModeState = Pick<
  AppModeState,
  'mode' | 'hasOnboarded' | 'hasSelectedMode'
>;

function sanitizePersistedAppModeState(value: unknown): PersistedAppModeState {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : Object.create(null);
  let mode: AppMode = raw['mode'] === 'cloud' ? 'cloud' : 'local';

  // Production web builds always use Managed Cloud. Desktop builds remain
  // Local until the signed CloudRuntime gate is proven and deliberately lifted.
  if (!supportsLocalAppMode && mode === 'local') mode = 'cloud';
  if (supportsLocalAppMode && mode === 'cloud') mode = 'local';

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
            // PA-3 / DESK-CLOUD-COPY-01: desktop managed cloud is NOT implemented
            // yet. The Rust cloud persistence commands fail closed with
            // ERR_CLOUD_NOT_IMPLEMENTED; the shared-backend wiring is a
            // fast-follow (DCL-1..4). On the desktop/local runtime we refuse to
            // enter Cloud mode at all — otherwise chatStore.isCloudMode() would
            // route chat persistence into the unimplemented command. Surface the
            // honest interim message instead. Local + BYOK both live in Local
            // mode on desktop and are unaffected. Managed cloud itself is PUBLIC
            // ALPHA on Web & Mobile (not invite/waitlist-gated).
            if (supportsLocalAppMode) {
              toast.info(DESKTOP_CLOUD_COMING_SOON);
              return;
            }
            // Non-desktop (web-preview) runtime: managed cloud is served
            // elsewhere; keep the auth + entitlement gate.
            const authState = useAuthStore.getState();
            const hasCloudSession = authState.isAuthenticated && !!authState.accessToken;
            if (!hasCloudSession) {
              toast.error('Sign in to use AGI Cloud.');
              return;
            }
            const accountPlan = useAuthStore.getState().plan ?? 'free';
            if (!CLOUD_MANAGED_TIERS.has(accountPlan)) {
              toast.error('Managed Cloud is available to Basic, Pro, Max, and Enterprise tiers.');
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
