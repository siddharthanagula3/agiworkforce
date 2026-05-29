'use client';

import { getAuthToken } from '@shared/lib/get-auth-token';

export interface ClientSubscription {
  id: string;
  plan_tier: string;
  status: string;
  current_period_end: string | null;
}

// SyncSubscriptionResponse removed - manual sync functionality removed

/**
 * Client-side function to refresh subscription status from the API
 * Use this in client components to poll for subscription updates
 */
export async function refreshSubscriptionStatus(): Promise<ClientSubscription | null> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      subscription?: ClientSubscription | null;
    };
    return data.subscription ?? null;
  } catch {
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
