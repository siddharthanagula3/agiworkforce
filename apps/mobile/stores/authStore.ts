import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '@/lib/secureStorage';
import { supabase } from '@/services/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;

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

      initialize: async () => {
        try {
          const { data } = await supabase.auth.getSession();
          set({
            session: data.session,
            user: data.session?.user ?? null,
            isLoading: false,
            isInitialized: true,
          });

          // Unsubscribe previous listener to prevent leaks on re-initialization
          if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
          }

          // Listen for auth state changes
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((_event, session) => {
            set({ session, user: session?.user ?? null });
          });
          authSubscription = subscription;
        } catch {
          set({ isLoading: false, isInitialized: true });
        }
      },

      signInWithEmail: async (email, password) => {
        set({ isLoading: true });
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          set({ isLoading: false });
          throw error;
        }
        set({
          session: data.session,
          user: data.user,
          isLoading: false,
        });
      },

      signUpWithEmail: async (email, password) => {
        set({ isLoading: true });
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          set({ isLoading: false });
          throw error;
        }
        set({
          session: data.session,
          user: data.user,
          isLoading: false,
        });
      },

      signInWithApple: async (idToken, nonce) => {
        set({ isLoading: true });
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: idToken,
          nonce,
        });
        if (error) {
          set({ isLoading: false });
          throw error;
        }
        set({
          session: data.session,
          user: data.user,
          isLoading: false,
        });
      },

      signInWithGoogle: async (accessToken) => {
        set({ isLoading: true });
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: accessToken,
        });
        if (error) {
          set({ isLoading: false });
          throw error;
        }
        set({
          session: data.session,
          user: data.user,
          isLoading: false,
        });
      },

      signOut: async () => {
        try {
          await supabase.auth.signOut();
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
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const timeoutPromise = new Promise<never>(
            (_, reject) =>
              (timeoutId = setTimeout(() => reject(new Error('Session refresh timeout')), 10000)),
          );
          const { data, error } = await Promise.race([
            supabase.auth.refreshSession(),
            timeoutPromise,
          ]);
          if (error || !data.session) {
            set({ session: null, user: null });
            return;
          }
          set({ session: data.session, user: data.session.user });
        } catch {
          set({ session: null, user: null });
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      },

      resetPassword: async (email) => {
        // CRIT-MOB-01 fix (red-team finding 2026-05): Supabase emits the
        // recovery JWT in the redirect URL fragment. Sending it to a
        // custom scheme (`agiworkforce://reset-password`) lets any APK on
        // an Android device register the same scheme and intercept the
        // recovery token — full account takeover.
        //
        // We now redirect to the verified HTTPS App Link
        // (`https://agiworkforce.com/auth/reset-password`). HTTPS App Links
        // require domain ownership verification (assetlinks.json on Android,
        // AASA on iOS, served from /.well-known/ on agiworkforce.com), so a
        // hostile app cannot claim the same path. If the OS hasn't been
        // taught about the App Link yet, the URL opens in the browser and
        // the user completes the flow on the web — also safe, because the
        // web reset-password page is on the same origin and the JWT stays
        // there.
        //
        // Mirrors the same fix already applied to Google OAuth in
        // components/auth/OAuthButtons.tsx (HIGH-MOB-04). The
        // assetlinks.json + AASA prerequisite is a deployment-side task,
        // not a mobile-code task.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://agiworkforce.com/auth/reset-password',
        });
        if (error) {
          throw error;
        }
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
        // CRIT-MOB-01 fix (2026-05-04): Do NOT load the Supabase session or set
        // isInitialized here. The biometric gate in _layout.tsx must succeed BEFORE
        // the session is surfaced to the rest of the app.
        //
        // Previous behaviour wired onAuthStateChange here, which caused the
        // Supabase client to have an active session (readable via
        // `supabase.auth.getSession()`) before the user passed biometric auth —
        // a complete bypass when the biometric catch block was fail-open.
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
