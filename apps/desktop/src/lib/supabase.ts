import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
  );
}

const supabaseClient = createClient<Database>(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/** @deprecated Use getSupabase() for consistency with services */
export const supabase = supabaseClient;

/**
 * Get the Supabase client instance
 * Preferred method for accessing Supabase in services
 */
export function getSupabase() {
  return supabaseClient;
}

// Helper to get current user
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Helper to get current session
export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// ============================================================================
// Canonical Types
// ============================================================================

/**
 * Canonical plan tier definition - use this everywhere
 * This is the single source of truth for plan tiers in the app.
 */
export type PlanTier = 'hobby' | 'free' | 'pro' | 'max' | 'enterprise';

/** Valid PlanTier values for runtime validation */
const VALID_PLAN_TIERS: readonly PlanTier[] = [
  'hobby',
  'free',
  'pro',
  'max',
  'enterprise',
] as const;

/**
 * Validate and coerce a string to PlanTier
 * Returns 'hobby' as the default if the value is invalid (hobby replaces free)
 */
export function asPlanTier(value: string | null | undefined): PlanTier {
  if (value && VALID_PLAN_TIERS.includes(value as PlanTier)) {
    return value as PlanTier;
  }
  return 'hobby';
}

/**
 * Plan display names
 */
export const PLAN_DISPLAY_NAMES: Record<PlanTier, string> = {
  hobby: 'Hobby',
  free: 'Free', // Deprecated, kept for backward compatibility
  pro: 'Pro',
  max: 'Max',
  enterprise: 'Enterprise',
};

// Type-safe table helpers
export type Tables = Database['public']['Tables'];
export type Profile = Tables['profiles']['Row'];
export type Subscription = Tables['subscriptions']['Row'];
export type BetaInvite = Tables['beta_invites']['Row'];
export type Waitlist = Tables['waitlist']['Row'];
export type EmailPreferences = Tables['email_preferences']['Row'];
export type PricingPlan = Tables['pricing_plans']['Row'];
export type UsageEvent = Tables['usage_events']['Row'];
export type FeatureFlag = Tables['feature_flags']['Row'];
