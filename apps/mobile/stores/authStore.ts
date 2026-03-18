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
        } catch (error) {
          console.warn('[authStore] Failed to initialize session:', error);
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
        } catch (error) {
          console.warn('[authStore] signOut error:', error);
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
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Session refresh timeout')), 10000),
          );
          const { data, error } = await Promise.race([
            supabase.auth.refreshSession(),
            timeoutPromise,
          ]);
          if (error || !data.session) {
            console.warn('[authStore] Refresh failed:', error?.message ?? 'no session');
            set({ session: null, user: null });
            return;
          }
          set({ session: data.session, user: data.session.user });
        } catch (err) {
          console.warn(
            '[authStore] Refresh failed:',
            err instanceof Error ? err.message : 'unknown error',
          );
          set({ session: null, user: null });
        }
      },

      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'agiworkforce://reset-password',
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
        // If we have a cached session, skip the loading spinner
        if (state?.session) {
          state.isLoading = false;
          state.isInitialized = true;
        }
      },
    },
  ),
);
