/**
 * Auth Store
 * Manages user authentication state and current user information
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setUser: (user: User | null) => void;
  getCurrentUserId: () => string;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user: User | null) => {
        set({
          user,
          isAuthenticated: !!user,
        });
      },

      getCurrentUserId: () => {
        const state = get();
        return state.user?.id || 'default-user';
      },

      clearAuth: () => {
        set({
          user: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);

// Initialize with default user if not set
// In production, this would check for existing session or prompt login
if (typeof window !== 'undefined') {
  const store = useAuthStore.getState();
  if (!store.user) {
    // Set a default user for development
    // In production, this would come from auth system
    store.setUser({
      id: 'default-user',
      email: 'user@agiworkforce.com',
      name: 'User',
    });
  }
}
