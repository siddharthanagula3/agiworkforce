import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabaseAuth } from '../services/supabaseAuth';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;

  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user: User | null) => {
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        });
      },

      getCurrentUserId: () => {
        const state = get();
        return state.user?.id || '';
      },

      clearAuth: () => {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      signIn: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await supabaseAuth.signIn({ email, password });

          if (response.error) {
            set({ error: response.error.message });
            return { error: response.error.message };
          }

          return { error: null };
        } catch (error) {
          console.error('[AuthStore] Sign in exception:', error);
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          return { error: message };
        } finally {
          set({ isLoading: false });
        }
      },

      signUp: async (email: string, password: string, name?: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await supabaseAuth.signUp({
            email,
            password,
            displayName: name,
          });

          if (response.error) {
            set({ error: response.error.message });
            return { error: response.error.message };
          }

          return { error: null };
        } catch (error) {
          console.error('[AuthStore] Sign up exception:', error);
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          return { error: message };
        } finally {
          set({ isLoading: false });
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          await supabaseAuth.signOut();
        } catch (error) {
          console.error('[AuthStore] Sign out error:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      signInWithMagicLink: async (email: string) => {
        set({ isLoading: true, error: null });

        try {
          const { error } = await supabaseAuth.signInWithMagicLink(email);

          if (error) {
            set({ error: error.message });
            return { error: error.message };
          }

          return { error: null };
        } catch (error) {
          console.error('[AuthStore] Magic link sign in exception:', error);
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          return { error: message };
        } finally {
          set({ isLoading: false });
        }
      },

      resetPassword: async (email: string) => {
        set({ isLoading: true, error: null });

        const { error } = await supabaseAuth.resetPassword(email);

        if (error) {
          set({ isLoading: false, error: error.message });
          return { error: error.message };
        }

        set({ isLoading: false });
        return { error: null };
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

export function initializeAuthStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange((authState) => {
    const store = useAuthStore.getState();

    if (authState.user) {
      store.setUser({
        id: authState.user.id,
        email: authState.user.email || '',
        name:
          authState.profile?.display_name ||
          (authState.user.user_metadata?.['full_name'] as string),
        avatar:
          authState.profile?.avatar_url || (authState.user.user_metadata?.['avatar_url'] as string),
      });
    } else if (!authState.isLoading) {
      store.clearAuth();
    }
  });

  return unsubscribe;
}

if (typeof window !== 'undefined') {
  supabaseAuth.checkSession();
}
