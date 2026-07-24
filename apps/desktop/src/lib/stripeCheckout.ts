import type { BillingInterval, BillingPlanTier } from '@agiworkforce/types';
import { WEB_APP_URL } from '../api/config';
import { cloudFetch } from '../api/cloudApi';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import { openExternalUrl } from '../utils/navigation';
import { isTauri } from './runtimeEnvironment';
import { openDesktopBillingWindow } from '../services/desktopBillingWindow';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../services/managedCloudBoundary';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = (await cloudAccountAuth.getValidSession())?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readBillingError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload)) return fallback;
  const error = payload['error'];
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  if (typeof payload['message'] === 'string') return payload['message'];
  return fallback;
}

async function readBillingPayload(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => null);
  return isRecord(payload) ? payload : {};
}

function readBillingErrorCode(payload: Record<string, unknown>): string | null {
  const error = payload['error'];
  if (!isRecord(error)) return null;
  return typeof error['code'] === 'string' ? error['code'] : null;
}

function billingErrorFromPayload(payload: Record<string, unknown>, fallback: string): string {
  const error = payload['error'];
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  if (typeof payload['message'] === 'string') return payload['message'];
  return fallback;
}

async function openBillingUrl(
  url: string,
  title: string,
  onClosed?: () => void | Promise<void>,
): Promise<void> {
  if (isTauri) {
    await openDesktopBillingWindow(url, title, onClosed);
    return;
  }
  await openExternalUrl(url);
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
  onClosed?: () => void | Promise<void>,
): Promise<string | null> {
  const authHeaders = await getAuthHeaders();

  if (!authHeaders['Authorization']) {
    return 'Please sign in to upgrade your plan.';
  }
  const boundary = captureManagedCloudBoundary('Cloud checkout');

  let url: string;
  try {
    const res = await cloudFetch(`${WEB_APP_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `agi.checkout.desktop.${crypto.randomUUID()}`,
        ...authHeaders,
      },
      body: JSON.stringify({ plan: tierId, billingInterval: interval }),
    });

    if (!res.ok) {
      const msg = await readBillingError(res, `Checkout failed (${res.status})`);
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const payload: unknown = await res.json();
    if (!isRecord(payload) || typeof payload['url'] !== 'string') {
      return 'No checkout URL returned from server.';
    }
    url = payload['url'];
  } catch {
    return 'Unable to reach payment service. Check your internet connection.';
  }

  assertManagedCloudBoundary(boundary);
  await openBillingUrl(url, 'Complete your AGI plan purchase', onClosed);
  return null;
}

/**
 * Opens the Stripe Billing Portal for managing an existing subscription
 * (pause, downgrade, cancel, update payment).
 */
export async function openBillingPortal(
  onClosed?: () => void | Promise<void>,
): Promise<string | null> {
  const authHeaders = await getAuthHeaders();

  if (!authHeaders['Authorization']) {
    return 'Please sign in to manage your subscription.';
  }
  const boundary = captureManagedCloudBoundary('Cloud billing portal');

  let url: string;
  try {
    const res = await cloudFetch(`${WEB_APP_URL}/api/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });

    if (!res.ok) {
      const msg = await readBillingError(res, `Portal error (${res.status})`);
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const payload: unknown = await res.json();
    if (!isRecord(payload) || typeof payload['url'] !== 'string') {
      return 'No portal URL returned from server.';
    }
    url = payload['url'];
  } catch {
    return 'Unable to reach billing portal. Check your internet connection.';
  }

  assertManagedCloudBoundary(boundary);
  await openBillingUrl(url, 'Manage AGI billing', onClosed);
  return null;
}

export type UpgradePreview =
  | {
      kind: 'prorated';
      amountDueNowCents: number;
      recurringAmountCents: number;
      currency: string;
      previewToken: string;
    }
  | {
      kind: 'checkout-required';
      amountDueNowCents: number;
      recurringAmountCents: number;
      currency: string;
      message: string;
    };

export async function previewPlanUpgrade(
  tierId: BillingPlanTier,
  interval: BillingInterval = 'monthly',
): Promise<UpgradePreview> {
  const boundary = captureManagedCloudBoundary('Cloud plan upgrade preview');
  const authHeaders = await getAuthHeaders();
  if (!authHeaders['Authorization']) throw new Error('Please sign in to upgrade your plan.');

  const response = await cloudFetch(`${WEB_APP_URL}/api/upgrade/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ plan: tierId, billingInterval: interval }),
  });
  const payload = await readBillingPayload(response);
  assertManagedCloudBoundary(boundary);

  if (response.status === 409 && readBillingErrorCode(payload) === 'checkout_required') {
    const checkout = isRecord(payload['checkout']) ? payload['checkout'] : {};
    const amount = checkout['amountDueNowCents'];
    const recurringAmount = checkout['recurringAmountCents'];
    const currency = checkout['currency'];
    if (
      typeof amount !== 'number' ||
      typeof recurringAmount !== 'number' ||
      typeof currency !== 'string'
    ) {
      throw new Error('The full checkout price could not be verified.');
    }
    return {
      kind: 'checkout-required',
      amountDueNowCents: amount,
      recurringAmountCents: recurringAmount,
      currency,
      message: isRecord(payload['error'])
        ? String(payload['error']['message'] ?? 'A new checkout is required.')
        : 'A new checkout is required.',
    };
  }
  if (!response.ok) {
    throw new Error(billingErrorFromPayload(payload, 'Could not calculate the upgrade.'));
  }

  const amount = payload['amountDueNowCents'];
  const recurringAmount = payload['recurringAmountCents'];
  const currency = payload['currency'];
  const previewToken = payload['previewToken'];
  if (
    typeof amount !== 'number' ||
    typeof recurringAmount !== 'number' ||
    typeof currency !== 'string' ||
    typeof previewToken !== 'string' ||
    !previewToken
  ) {
    throw new Error('The upgrade preview returned an invalid response.');
  }
  return {
    kind: 'prorated',
    amountDueNowCents: amount,
    recurringAmountCents: recurringAmount,
    currency,
    previewToken,
  };
}

export async function applyPlanUpgrade(
  tierId: BillingPlanTier,
  previewToken: string,
  interval: BillingInterval = 'monthly',
): Promise<{ kind: 'webhook-pending' } | { kind: 'payment-action-required'; paymentUrl: string }> {
  const boundary = captureManagedCloudBoundary('Cloud plan upgrade');
  const authHeaders = await getAuthHeaders();
  if (!authHeaders['Authorization']) throw new Error('Please sign in to upgrade your plan.');

  const response = await cloudFetch(`${WEB_APP_URL}/api/upgrade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      plan: tierId,
      billingInterval: interval,
      previewToken,
    }),
  });
  const payload = await readBillingPayload(response);
  assertManagedCloudBoundary(boundary);
  if (response.status === 402 && payload['paymentActionRequired'] === true) {
    const paymentUrl = payload['paymentUrl'];
    if (typeof paymentUrl === 'string' && paymentUrl) {
      return { kind: 'payment-action-required', paymentUrl };
    }
    throw new Error(
      'Your card requires additional authentication, but Stripe did not return a hosted payment page. Open Billing to complete the pending payment; your current plan remains active until payment succeeds.',
    );
  }
  if (!response.ok) {
    throw new Error(
      isRecord(payload['error']) && typeof payload['error']['message'] === 'string'
        ? payload['error']['message']
        : 'The plan upgrade failed. Your current plan is unchanged.',
    );
  }
  if (payload['activation'] !== 'webhook_pending') {
    throw new Error('The upgrade could not be verified. Your current plan is unchanged.');
  }
  return { kind: 'webhook-pending' };
}

export async function openUpgradePayment(
  paymentUrl: string,
  onClosed?: () => void | Promise<void>,
): Promise<void> {
  captureManagedCloudBoundary('Cloud upgrade payment');
  await openBillingUrl(paymentUrl, 'Complete your AGI upgrade payment', onClosed);
}

/**
 * Refreshes the canonical account snapshot while the billing webhook settles.
 * This mirrors Web's bounded 1s/3s/8s invalidation sequence and never mutates
 * the displayed plan optimistically.
 */
export async function waitForPlanActivation(tierId: BillingPlanTier): Promise<boolean> {
  const boundary = captureManagedCloudBoundary('Cloud plan activation');
  const delays = [0, 1_000, 3_000, 8_000];
  for (const delay of delays) {
    if (delay > 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
    }
    await cloudAccountAuth.refreshUserData();
    assertManagedCloudBoundary(boundary);
    if (cloudAccountAuth.getPlanTier() === tierId) return true;
  }
  return false;
}
