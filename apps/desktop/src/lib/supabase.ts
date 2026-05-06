import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { invoke, isTauri } from './tauri-mock';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage =
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file. ' +
    'You can find these values in your Supabase project dashboard under Settings → API. ' +
    'Example .env.local:\n' +
    'VITE_SUPABASE_URL=https://xxxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=your-anon-key-here';

  console.error(errorMessage);
  // Supabase features will be unavailable — do NOT throw here because the
  // desktop app uses device-link OAuth (not Supabase JS) for core auth, and
  // throwing at module load time crashes auth.ts / authOrchestrator.ts which
  // import this module, preventing any LLM streaming from ever starting.
}

// FIX-004 (Sprint 1): in Tauri, persist Supabase auth tokens through the
// `supabase_token_*` IPCs which encrypt with the master-password vault.
// In the web build, fall back to plain localStorage — the tokens are only
// as protected as the browser session anyway, and the previous "encryption"
// in Tauri was theatre because the key was reproducible from source.
//
// One-shot migration path: tauriStorage.getItem first checks the new IPC
// store. If empty AND a localStorage value exists from the pre-FIX-004
// build, it decrypts the legacy ciphertext (or accepts plaintext JSON),
// promotes it into the IPC store via setItem, and removes the
// localStorage entry. After the first read each key is fully migrated.

let legacyKey: CryptoKey | null = null;
async function deriveLegacyStorageKey(): Promise<CryptoKey> {
  if (legacyKey) return legacyKey;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('agiworkforce-storage-v1-' + window.location.hostname),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('agi-supabase-storage-salt-2026'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  legacyKey = key;
  return key;
}

async function decryptLegacyValue(stored: string): Promise<string | null> {
  if (stored.startsWith('{') || stored.startsWith('"') || stored.startsWith('[')) {
    return stored;
  }
  try {
    const key = await deriveLegacyStorageKey();
    const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

const tauriStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await invoke<string | null>('supabase_token_get', { key });
      if (value !== null) return value;
    } catch (err) {
      // Most likely: vault is locked or master password not configured.
      // Surface as null so Supabase JS treats it as "no session" and
      // re-auth triggers; the unlock UI can then prompt for the password.
      console.warn('[supabase] vault read failed for', key, err);
      return null;
    }

    // Legacy migration: the pre-FIX-004 build stored these in localStorage
    // with a public-derivable key. Promote that single time, then forget.
    const legacy = localStorage.getItem(key);
    if (!legacy) return null;
    const plaintext = await decryptLegacyValue(legacy);
    if (plaintext === null) {
      localStorage.removeItem(key);
      return null;
    }
    try {
      await invoke<void>('supabase_token_set', { key, value: plaintext });
      localStorage.removeItem(key);
      return plaintext;
    } catch (err) {
      // DESK-11 (audit 2026-05-03): if the vault write fails (locked /
      // not yet configured / IPC error), DO NOT return the bare
      // plaintext token. The previous implementation kept returning the
      // localStorage value indefinitely — the token never migrated and
      // continued to live unencrypted on disk. Return null so Supabase
      // treats it as "no session" and triggers a fresh sign-in flow,
      // which lets the user unlock the vault first. Wipe the legacy
      // entry too so we don't dangle plaintext forever.
      console.warn('[supabase] vault migration write failed; clearing legacy plaintext', err);
      localStorage.removeItem(key);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await invoke<void>('supabase_token_set', { key, value });
    } catch (err) {
      console.error('[supabase] vault write failed for', key, err);
      throw err;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await invoke<void>('supabase_token_remove', { key });
    } catch (err) {
      console.warn('[supabase] vault remove failed for', key, err);
    }
    localStorage.removeItem(key);
  },
};

const webStorage = {
  getItem: async (key: string): Promise<string | null> =>
    Promise.resolve(localStorage.getItem(key)),
  setItem: async (key: string, value: string): Promise<void> => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: async (key: string): Promise<void> => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const secureStorage = isTauri ? tauriStorage : webStorage;

// Use a placeholder URL when env vars are missing so createClient doesn't throw
// at module load time (empty string is rejected by the Supabase SDK).
// All auth operations will fail gracefully at call-time instead of at startup.
const supabaseClient = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: secureStorage,
    },
  },
);

export const supabase = supabaseClient;

export function getSupabase() {
  return supabaseClient;
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * `PlanTier` is a UNION TYPE — the set of valid tier strings persisted in
 * Supabase `subscriptions.tier`.  It is intentionally unordered.
 *
 * For PRECEDENCE / hierarchy (which tier is "higher"), see
 * `PLAN_TIER_HIERARCHY` in `apps/desktop/src/utils/subscriptionGate.ts`.
 *
 * Canonical 6-tier taxonomy lives in `apps/desktop/src/types/pricing.ts`
 * (`PricingModel`).  `'free'` here is a legacy alias kept for backward compat;
 * new tiers (`'local-only'`, `'byok'`) are added there as the source of truth.
 */
export type PlanTier = 'local-only' | 'byok' | 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

const VALID_PLAN_TIERS: readonly PlanTier[] = [
  'local-only',
  'byok',
  'free',
  'hobby',
  'pro',
  'max',
  'enterprise',
] as const;

export function asPlanTier(value: string | null | undefined): PlanTier {
  const normalized = value?.toLowerCase();
  if (normalized && VALID_PLAN_TIERS.includes(normalized as PlanTier)) {
    return normalized as PlanTier;
  }
  return 'free';
}

export const PLAN_DISPLAY_NAMES: Record<PlanTier, string> = {
  'local-only': 'Local Only',
  byok: 'BYOK',
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
  enterprise: 'Enterprise',
};

export type Tables = Database['public']['Tables'];
export type Profile = Tables['profiles']['Row'];
export type Subscription = Tables['subscriptions']['Row'];
export type BetaInvite = Tables['beta_invites']['Row'];
export type Waitlist = Tables['waitlist']['Row'];
export type EmailPreferences = Tables['email_preferences']['Row'];
export type PricingPlan = Tables['pricing_plans']['Row'];
export type UsageEvent = Tables['usage_events']['Row'];
export type FeatureFlag = Tables['feature_flags']['Row'];

/**
 * AUDIT-P3-TYPE: Minimal profile fields needed for fallback construction.
 * Used when database is unavailable but we have auth user metadata.
 */
export interface FallbackProfileData {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  stripe_customer_id: string | null;
  credits: unknown;
}

/**
 * AUDIT-P3-TYPE: Type guard to validate profile-like data has required fields.
 */
export function isValidProfileData(data: unknown): data is FallbackProfileData {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['email'] === 'string' &&
    typeof obj['display_name'] === 'string' &&
    typeof obj['created_at'] === 'string' &&
    typeof obj['updated_at'] === 'string'
  );
}
