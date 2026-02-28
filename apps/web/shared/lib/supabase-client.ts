/**
 * Centralized Supabase Client
 * Prevents multiple GoTrueClient instances
 * Updated: Jan 10th 2026 - Removed hardcoded token fallback for security
 * Updated: Feb 27th 2026 - Lazy initialization for SSR compatibility
 * Updated: Feb 28th 2026 - Use @supabase/ssr createBrowserClient for cookie-based auth
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@shared/types/supabase';

// Lazy singleton — avoids throwing at module scope during SSR/build
let _supabase: SupabaseClient<Database> | null = null;

function getSupabaseClient(): SupabaseClient<Database> {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window === 'undefined') {
      _supabase = createClient<Database>(
        supabaseUrl || 'http://localhost:54321',
        supabaseAnonKey || 'placeholder-key',
        {
          auth: { persistSession: false },
          global: { headers: { 'X-Client-Info': 'agi-workforce@1.0.0' } },
        },
      );
      return _supabase;
    }
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. ' +
        'For local development, run: supabase start',
    );
  }

  // On the client side, use createBrowserClient from @supabase/ssr
  // This reads auth tokens from cookies (set by SSR middleware) instead of localStorage,
  // keeping client-side auth in sync with server-side auth.
  if (typeof window !== 'undefined') {
    _supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
    return _supabase;
  }

  // Server-side fallback (should use utils/supabase/server.ts instead)
  _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'agi-workforce@1.0.0' } },
  });

  return _supabase;
}

// Proxy object that lazily initializes the client on first property access
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

// Export for backward compatibility
export default supabase;
