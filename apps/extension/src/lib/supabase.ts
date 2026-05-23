import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Vite injects import.meta.env at build time; the extension tsconfig does not
// include vite/client types so we cast through unknown here.
const metaEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

const supabaseUrl = metaEnv['VITE_SUPABASE_URL'];
const supabaseAnonKey = metaEnv['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[AGI Extension] Missing Supabase env vars. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local. ' +
      'Cloud features (waitlist, invite redemption) will not work.',
  );
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      supabaseUrl ?? 'https://placeholder.supabase.co',
      supabaseAnonKey ?? 'placeholder-anon-key',
      {
        auth: {
          persistSession: true,
          storage: {
            getItem: (key: string) => {
              try {
                return localStorage.getItem(key);
              } catch {
                return null;
              }
            },
            setItem: (key: string, value: string) => {
              try {
                localStorage.setItem(key, value);
              } catch {
                // extension storage unavailable in service worker context
              }
            },
            removeItem: (key: string) => {
              try {
                localStorage.removeItem(key);
              } catch {
                // swallow
              }
            },
          },
        },
      },
    );
  }
  return client;
}

/** Test-only reset. */
export function __resetSupabaseClientForTests(): void {
  client = null;
}
