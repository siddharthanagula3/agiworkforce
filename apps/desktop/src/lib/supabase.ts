import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your build environment or Vercel project settings.',
  );
}

const supabaseClient = createClient<Database>(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
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
  return 'hobby';
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
