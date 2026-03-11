import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

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

// Derive a symmetric key from a stable per-device secret.
// We use a combination of the app's origin + a fixed salt.
// NOTE: This is not perfect (anyone with source can reproduce the derivation),
// but it protects against static file exfiltration and naive localStorage dumps.
let cachedKey: CryptoKey | null = null;

async function deriveStorageKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

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

  cachedKey = key;
  return key;
}

async function encryptValue(value: string): Promise<string> {
  const key = await deriveStorageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Pack iv + ciphertext as base64
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptValue(stored: string): Promise<string> {
  // If it looks like plaintext JSON (Supabase session data), return as-is (migration path)
  if (stored.startsWith('{') || stored.startsWith('"') || stored.startsWith('[')) {
    return stored;
  }

  try {
    const key = await deriveStorageKey();
    const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    // Not plaintext and decryption failed — corrupted ciphertext
    console.warn('[supabase] Removing corrupted encrypted value from localStorage');
    return ''; // Supabase will treat empty as no session and trigger re-auth
  }
}

// localStorage-based storage adapter for Supabase auth with AES-GCM encryption.
// Using localStorage instead of system keyring to avoid OS permission prompts.
// Values are encrypted before write and decrypted on read to protect against
// static file exfiltration and naive localStorage dumps.
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return decryptValue(stored);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const encrypted = await encryptValue(value);
    localStorage.setItem(key, encrypted);
  },
  removeItem: async (key: string): Promise<void> => {
    localStorage.removeItem(key);
  },
};

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

export type PlanTier = 'hobby' | 'free' | 'pro' | 'max' | 'enterprise';

const VALID_PLAN_TIERS: readonly PlanTier[] = [
  'hobby',
  'free',
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
  hobby: 'Hobby',
  free: 'Free',
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
