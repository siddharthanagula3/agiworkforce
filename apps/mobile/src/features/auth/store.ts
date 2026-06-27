import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '@/lib/secureStorage';
import {
  clearAuthSession,
  type MobileAuthSession,
  type MobileAuthUser,
} from '@/services/authSession';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface AuthState {
  session: MobileAuthSession | null;
  user: MobileAuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  /**
   * True when Clerk's native AuthView has a live session (bridged from
   * ClerkTokenBridge via setClerkSignedIn). This is the REAL sign-in signal for
   * cloud-lifecycle effects (tier refresh, realtime, push, sync) — the legacy
   * `session` field is always null in v1 because initialize() never sets it.
   */
  isClerkSignedIn: boolean;
  setClerkSignedIn: (value: boolean) => void;
  /**
   * True once Clerk's SDK has finished its async initialization (useAuth().isLoaded).
   * Defaults to false on every cold-start; set by ClerkTokenBridge when isLoaded
   * first fires. Never persisted. Used to guard auth-gated redirects and cloud-send
   * gates against the ~200ms cold-start window where isClerkSignedIn is false even
   * for a genuinely-signed-in user.
   */
  isClerkLoaded: boolean;
  setClerkLoaded: (value: boolean) => void;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: (idToken: string, nonce: string) => Promise<void>;
  signInWithGoogle: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

/** Auth subscription — tracked to prevent leaks */
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      session: null,
      user: null,
      isLoading: true,
      isInitialized: false,
      isClerkSignedIn: false,
      isClerkLoaded: false,

      setClerkSignedIn: (value: boolean) => {
        set((state) => {
          if (state.isClerkSignedIn === value) return state;
          return { isClerkSignedIn: value };
        });
      },

      setClerkLoaded: (value: boolean) => {
        set((state) => {
          if (state.isClerkLoaded === value) return state;
          return { isClerkLoaded: value };
        });
      },

      initialize: async () => {
        if (authSubscription) {
          authSubscription.unsubscribe();
          authSubscription = null;
        }
        set({
          session: null,
          user: null,
          isLoading: false,
          isInitialized: true,
        });
      },

      signInWithEmail: async (email, password) => {
        void email;
        void password;
        throw new Error('auth: Clerk mobile auth is not enabled in v1');
      },

      signUpWithEmail: async (email, password) => {
        void email;
        void password;
        throw new Error('auth: Clerk mobile auth is not enabled in v1');
      },

      signInWithApple: async (idToken, nonce) => {
        void idToken;
        void nonce;
        throw new Error('auth: Clerk mobile auth is not enabled in v1');
      },

      signInWithGoogle: async (accessToken) => {
        void accessToken;
        throw new Error('auth: Clerk mobile auth is not enabled in v1');
      },

      signOut: async () => {
        try {
          await clearAuthSession();
        } catch {
          // signOut network call may fail — always clear local session below
        } finally {
          // Always clear session, even if signOut network call fails
          set({ session: null, user: null, isLoading: false });
          if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
          }
          // P2 sync teardown: stop the loop and drop cloud-scoped state so a
          // different account can never inherit this user's cloud chats, memories,
          // or pending sync queues. Lazy require avoids an auth↔api↔sync import
          // cycle at init.
          try {
            /* eslint-disable @typescript-eslint/no-require-imports */
            const { stopCloudSyncLoop } = require('@/services/cloudSyncEngine');
            const { useCloudSyncStateStore } = require('@/stores/chat/cloudSyncStateStore');
            const { useChatCloudMessageStore } = require('@/stores/chat/chatCloudMessageStore');
            const { useCloudMemoryStore } = require('@/stores/memory/cloudMemoryStore');
            const { useMemorySyncStateStore } = require('@/stores/memory/memorySyncStateStore');
            const { useCloudProjectStore } = require('@/stores/projects/cloudProjectStore');
            const { useProjectSyncStateStore } = require('@/stores/projects/projectSyncStateStore');
            // Settings trust-boundary reset: personalization and the settings sync
            // cursor are scoped to the signed-in user. Clear them so a subsequent
            // account cannot inherit a prior user's profile or push a wipe to cloud.
            // settingsUpdatedAt is set to null so the next pull adopts cloud state
            // rather than treating the cleared defaults as a local edit.
            const {
              useSettingsSyncStateStore,
            } = require('@/stores/settings/settingsSyncStateStore');
            const { useCloudSettingsStore } = require('@/stores/settings/cloudSettingsStore');
            /* eslint-enable @typescript-eslint/no-require-imports */
            stopCloudSyncLoop();
            useCloudSyncStateStore.getState().reset();
            useChatCloudMessageStore.getState().clearCloudData();
            // Memory trust-boundary reset: cloud memories and the memory sync cursor
            // are scoped to the signed-in user and MUST be cleared on sign-out so a
            // subsequent account cannot inherit a prior user's memories.
            useCloudMemoryStore.getState().clearCloudMemoryData();
            useMemorySyncStateStore.getState().resetMemorySync();
            // Project trust-boundary reset: cloud projects and the project sync cursor
            // are scoped to the signed-in user and MUST be cleared on sign-out so a
            // subsequent account cannot inherit a prior user's projects.
            useCloudProjectStore.getState().clearCloudProjectData();
            useProjectSyncStateStore.getState().resetProjectSync();
            useSettingsSyncStateStore.getState().resetSettingsSync();
            // Cloud settings trust-boundary reset: personalization and the settings
            // sync cursor are scoped to the signed-in user. Clear the cloud store's
            // personalization and settingsUpdatedAt so the next account starts fresh.
            // Local settings are intentionally preserved — they belong to this device,
            // not to the account.
            useCloudSettingsStore.setState({
              personalization: {
                fullName: '',
                nickname: '',
                occupation: '',
                instructions: '',
                warmth: 50,
                enthusiasm: 50,
                headersLists: 50,
                emoji: 50,
              },
              settingsUpdatedAt: null,
            });
          } catch (err) {
            console.warn('[auth] cloud sync teardown on sign-out failed:', err);
          }
        }
      },

      refreshSession: async () => {
        set({ session: null, user: null, isLoading: false, isInitialized: true });
      },

      resetPassword: async (email) => {
        void email;
        throw new Error('auth: Clerk mobile auth is not enabled in v1');
      },
    }),
    {
      name: 'auth-store',
      // Use OS keychain (expo-secure-store) for auth tokens — encrypts at rest on both
      // iOS (Keychain) and Android (Keystore). MMKV is used for non-sensitive stores.
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        // Only persist session — everything else is derived
        session: state.session,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        // Do NOT load cloud session state or set
        // isInitialized here. The biometric gate in _layout.tsx must succeed BEFORE
        // the session is surfaced to the rest of the app.
        //
        // Previous behaviour wired onAuthStateChange here, which caused the
        // cloud auth tokens before the user passed biometric auth.
        //
        // Now: rehydration clears any pre-loaded session so the store starts in a
        // pristine locked state. `initialize()` is the only path that loads the
        // session, and it is called from _layout.tsx AFTER `isUnlocked` is true.
        if (state) {
          state.session = null;
          state.user = null;
          state.isLoading = true;
          state.isInitialized = false;
        }
      },
    },
  ),
);
