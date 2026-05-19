import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';
import { WEB_APP_URL } from '../api/config';
import { supabaseAuth } from '../services/supabaseAuth';
import { openExternalUrl } from '../utils/navigation';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = supabaseAuth.getState().session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Opens a Stripe Checkout session for the given tier + interval.
 *
 * - POSTs to the web app's /api/checkout endpoint with the user's session JWT.
 * - If STRIPE_SECRET_KEY is not configured on the server, the server returns 503
 *   and we show a toast-like fallback message via the returned error string.
 * - For already-subscribed users, the server returns a billing portal URL instead.
 *
 * Returns an error string on failure, null on success.
 */
export async function openCheckout(
  tierId: BillingPlanTier,
  interval: BillingInterval = 'monthly',
): Promise<string | null> {
  const authHeaders = await getAuthHeaders();

  if (!authHeaders['Authorization']) {
    return 'Please sign in to upgrade your plan.';
  }

  let url: string;
  try {
    const res = await fetch(`${WEB_APP_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ plan: tierId, billingInterval: interval }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = body.error ?? `Checkout failed (${res.status})`;
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) return 'No checkout URL returned from server.';
    url = data.url;
  } catch {
    return 'Unable to reach payment service. Check your internet connection.';
  }

  await openExternalUrl(url);
  return null;
}

/**
 * Opens the Stripe Billing Portal for managing an existing subscription
 * (pause, downgrade, cancel, update payment).
 */
export async function openBillingPortal(): Promise<string | null> {
  const authHeaders = await getAuthHeaders();

  if (!authHeaders['Authorization']) {
    return 'Please sign in to manage your subscription.';
  }

  let url: string;
  try {
    const res = await fetch(`${WEB_APP_URL}/api/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = body.error ?? `Portal error (${res.status})`;
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) return 'No portal URL returned from server.';
    url = data.url;
  } catch {
    return 'Unable to reach billing portal. Check your internet connection.';
  }

  await openExternalUrl(url);
  return null;
}
