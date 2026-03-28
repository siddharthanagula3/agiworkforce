'use client';

import { useTheme as useNextTheme } from 'next-themes';
import type { User } from '@supabase/supabase-js';
import { ThemeProvider as SharedThemeProvider } from '@shared/components/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { useBillingStore } from '@/stores/unified/auth';

export const _stub = false;
export const LLM_MODELS: unknown[] = [];
export const PLAN_MODELS: unknown[] = [];

export const ThemeProvider = SharedThemeProvider;
export const useTheme = useNextTheme;

function getAuthState() {
  return useBillingStore.getState();
}

interface SupabaseAuthCompat {
  auth: typeof supabase.auth;
  getUser(): User | null;
  refreshUser(): Promise<User | null>;
  signOut(): Promise<void>;
}

/**
 * Compatibility facade for older chat components that still expect a sync
 * `getUser()` method. The real auth source of truth is the unified auth store,
 * which is kept in sync with Supabase on bootstrap and auth state changes.
 */
export const supabaseAuth: SupabaseAuthCompat = {
  auth: supabase.auth,
  getUser() {
    return getAuthState().user;
  },
  async refreshUser() {
    await getAuthState().refreshUser();
    return getAuthState().user;
  },
  async signOut() {
    await getAuthState().signOut();
  },
};

export default supabaseAuth;
