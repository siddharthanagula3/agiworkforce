import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage =
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file. ' +
    'You can find these values in your Supabase project dashboard under Settings → API. ' +
    'Example .env.local:\n' +
    'NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co\n' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here';

  console.error(errorMessage);
  // Supabase features will be unavailable — do NOT throw here because the
  // desktop app uses device-link OAuth (not Supabase JS) for core auth, and
  // throwing at module load time crashes auth.ts / authOrchestrator.ts which
  // import this module, preventing any LLM streaming from ever starting.
}

// localStorage-based storage adapter for Supabase auth (client-side only).
// In server context (API routes, SSR), localStorage is unavailable — return no-ops.
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },
};

const supabaseClient = createClient<Database>(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: secureStorage,
  },
});

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

/**
 * @deprecated Prefer getCurrentUser() which uses getUser() for server-side JWT
 * verification. getSession() only reads the cookie without validating the token,
 * making it vulnerable to session fixation with tampered cookies.
 * Only use this when you specifically need the session tokens (access_token, refresh_token).
 */
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
