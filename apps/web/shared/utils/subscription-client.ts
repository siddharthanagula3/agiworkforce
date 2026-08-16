'use client';

import { getAuthToken } from '@shared/lib/get-auth-token';

export interface ClientSubscription {
  id: string;
  plan_tier: string;
  status: string;
  current_period_end: string | null;
}

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
    return null;
  }
}

export function isSubscriptionValid(sub: ClientSubscription | null): boolean {
  if (!sub) return false;
  const activeStatuses = ['active', 'trialing'];
  return activeStatuses.includes(sub.status) && sub.plan_tier !== 'free';
}
