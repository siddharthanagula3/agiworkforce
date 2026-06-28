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
export type { PlanTier } from '../lib/cloudAccountTypes';
import type { PlanTier } from '../lib/cloudAccountTypes';

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

// v2 (PA-3): force the desktop runtime out of any stale persisted Cloud mode.
// Desktop managed cloud is not implemented yet, so a Cloud mode persisted by an
// earlier build must not survive a reload (it would route chat persistence into
// the unimplemented Rust command). See migrate() below.
const APP_MODE_STORE_VERSION = 2;
const CLOUD_MANAGED_TIERS: ReadonlySet<PlanTier> = new Set([
  'hobby',
  'pro',
  'pro_plus',
  'max',
  'enterprise',
]);

export const useAppModeStore = create<AppModeState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        mode: supportsLocalAppMode ? 'local' : 'cloud',
        planTier: 'free',
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
            if (!CLOUD_MANAGED_TIERS.has(get().planTier)) {
              toast.error('Managed Cloud is available to Hobby, Pro, Max, and Enterprise tiers.');
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
          // Production web builds must always be in cloud mode.
          if (!supportsLocalAppMode && state.mode === 'local') {
            return { ...state, mode: 'cloud' };
          }
          // PA-3 / DESK-CLOUD-COPY-01: desktop managed cloud is not implemented;
          // drop any stale persisted Cloud mode so the desktop runtime never
          // reaches the unimplemented Rust cloud commands on reload.
          if (supportsLocalAppMode && state.mode === 'cloud') {
            return { ...state, mode: 'local' };
          }
          return state;
        },
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
export const selectPlanTier = (state: AppModeState): PlanTier => state.planTier;
export const selectHasOnboarded = (state: AppModeState): boolean => state.hasOnboarded;

/**
 * Maps the binary AppMode to the canonical 3-tier PrivacyMode from
 * @agiworkforce/types. Use this selector wherever code needs to branch on the
 * full trust boundary (local / byok / managed) rather than the simplified
 * local/cloud binary.
 *
 * Mapping:
 *   'local'  → 'local'    (device-only; no egress at any layer)
 *   'cloud'  + BYOK keys configured → 'byok'   (user-supplied keys, no AGI compute)
 *   'cloud'  + no BYOK keys         → 'managed' (AGI-managed compute — public alpha
 *                                                on Web & Mobile; desktop coming soon)
 *
 * BYOK detection: reads llmConfig.providerMode from settingsStore. When the
 * user has selected external provider keys ('cloud' providerMode in settings),
 * that is BYOK. Managed-cloud will add an explicit auth signal when it launches.
 */
export const selectPrivacyMode = (state: AppModeState): PrivacyMode => {
  if (state.mode === 'local') return 'local';
  // mode === 'cloud': distinguish BYOK (user-supplied keys, client-direct) from
  // managed (AGI compute) by the persisted llmConfig.providerMode.
  //
  // We read it from the PERSISTED settings (localStorage key
  // 'agiworkforce-settings') rather than importing settingsStore. A static
  // import creates a load-time cycle (appModeStore ↔ settings → auth chain), and
  // the previous lazy `require('./settingsStore')` silently throws under
  // ESM/Vite/Tauri and fell through to 'managed' — which made the egress guard
  // fail OPEN for BYOK (the exact population it must protect). A persisted-storage
  // read is cycle-free and resolves in every runtime. BYOK is only reachable once
  // the user has configured provider keys, so settings are always persisted then.
  try {
    const raw =
      typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage.getItem('agiworkforce-settings')
        : null;
    if (raw) {
      const providerMode = (
        JSON.parse(raw) as { state?: { llmConfig?: { providerMode?: string } } }
      )?.state?.llmConfig?.providerMode;
      if (providerMode === 'cloud') return 'byok';
    }
  } catch {
    // Unparseable/unavailable storage: fall through to managed for non-egress
    // consumers. (Egress callers must additionally fail closed on any error.)
  }
  return 'managed';
};
