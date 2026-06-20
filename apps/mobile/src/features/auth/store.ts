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

      setClerkSignedIn: (value: boolean) => {
        set((state) => {
          if (state.isClerkSignedIn === value) return state;
          return { isClerkSignedIn: value };
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
