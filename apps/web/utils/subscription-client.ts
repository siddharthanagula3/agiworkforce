'use client';

import { getSupabaseClient } from '../services/supabase';

export interface ClientSubscription {
  id: string;
  plan_tier: string;
  status: string;
  current_period_end: string | null;
}

export interface SyncSubscriptionResponse {
  success: boolean;
  message?: string;
  subscription?: ClientSubscription;
  error?: {
    code: string;
    message: string;
  };
}

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
      console.error('[subscription] Error refreshing subscription:', error);
      return null;
    }

    return subscription;
  } catch (error) {
    console.error('[subscription] Error refreshing subscription:', error);
    return null;
  }
}

/**
 * Force sync subscription from Stripe
 * This calls the server-side sync endpoint which queries Stripe directly
 * and updates the local subscription record.
 *
 * Use this when:
 * - The webhook may be delayed
 * - Local data seems stale or missing
 * - User just completed payment but subscription isn't showing
 */
export async function syncSubscriptionFromStripe(): Promise<ClientSubscription | null> {
  try {
    const response = await fetch('/api/sync-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[subscription] Sync API returned error:', response.status);
      return null;
    }

    const data: SyncSubscriptionResponse = await response.json();

    if (!data.success) {
      console.warn('[subscription] Sync returned success=false:', data.error?.message);
      // Even if sync reports failure, try to fetch from DB
      // as the subscription might already exist
      return refreshSubscriptionStatus();
    }

    if (data.subscription) {
      return {
        id: data.subscription.id,
        plan_tier: data.subscription.plan_tier,
        status: data.subscription.status,
        current_period_end: data.subscription.current_period_end,
      };
    }

    // Fallback to direct DB fetch
    return refreshSubscriptionStatus();
  } catch (error) {
    console.error('[subscription] Error syncing subscription from Stripe:', error);
    // On error, still try to fetch from DB
    return refreshSubscriptionStatus();
  }
}

/**
 * Check if subscription is valid (active and not free tier)
 */
export function isSubscriptionValid(sub: ClientSubscription | null): boolean {
  if (!sub) return false;
  const activeStatuses = ['active', 'trialing'];
  return activeStatuses.includes(sub.status) && sub.plan_tier !== 'free';
}
