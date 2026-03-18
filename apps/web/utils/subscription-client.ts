'use client';

import { getSupabaseClient } from '../services/supabase';

export interface ClientSubscription {
  id: string;
  plan_tier: string;
  status: string;
  current_period_end: string | null;
}

// SyncSubscriptionResponse removed - manual sync functionality removed

/**
 * Client-side function to refresh subscription status from Supabase
 * Use this in client components to poll for subscription updates
 */
export async function refreshSubscriptionStatus(): Promise<ClientSubscription | null> {
  try {
    const supabase = getSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('id, plan_tier, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      // Silently handle subscription refresh failure
      return null;
    }

    return subscription;
  } catch (error) {
    // Silently handle subscription refresh failure
    return null;
  }
}

// Manual sync removed - webhooks handle subscription creation automatically
// If you need to check subscription status, use refreshSubscriptionStatus() instead

/**
 * Check if subscription is valid (active and not free tier)
 */
export function isSubscriptionValid(sub: ClientSubscription | null): boolean {
  if (!sub) return false;
  const activeStatuses = ['active', 'trialing'];
  return activeStatuses.includes(sub.status) && sub.plan_tier !== 'free';
}
