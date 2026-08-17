import {
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  topUpUnitsForUsd,
  type BillingInterval,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { WEB_APP_URL } from '../api/config';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import { openExternalUrl } from '../utils/navigation';
import { isTauri } from './runtimeEnvironment';
import { openDesktopBillingWindow } from '../services/desktopBillingWindow';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../services/managedCloudBoundary';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';
import { useAuthStore } from '../stores/auth';
import { getDesktopSubscriptionOwnerPolicy } from './subscriptionOwnership';

type StripeBillingAction = 'portal' | 'plan-change';

function stripeBillingActionBlockReason(action: StripeBillingAction): string | null {
  const auth = useAuthStore.getState();
  const policy = getDesktopSubscriptionOwnerPolicy(
    auth.subscriptionSource,
    auth.subscriptionStatus,
    auth.subscriptionFetchStatus === 'succeeded',
  );

  if (action === 'portal') {
    if (policy.canOpenStripePortal) return null;
    return policy.stripeActionBlockedReason ?? 'This account has no Stripe-managed subscription.';
  }
  return policy.canStartStripePlanChange ? null : policy.stripeActionBlockedReason;
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

export async function openCheckout(
  tierId: BillingPlanTier,
  interval: BillingInterval = 'monthly',
  onClosed?: () => void | Promise<void>,
): Promise<string | null> {
  let request: ReturnType<typeof createManagedCloudRequestContext>;
  try {
    request = createManagedCloudRequestContext('Cloud checkout');
  } catch {
    return 'Please sign in to upgrade your plan.';
  }
  const ownershipBlock = stripeBillingActionBlockReason('plan-change');
  if (ownershipBlock) return ownershipBlock;

  let url: string;
  try {
    const res = await request.fetch(`${WEB_APP_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `agi.checkout.desktop.${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ plan: tierId, billingInterval: interval }),
    });
    request.assertBoundary();

    if (!res.ok) {
      const msg = await readBillingError(res, `Checkout failed (${res.status})`);
      request.assertBoundary();
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const payload: unknown = await res.json();
    request.assertBoundary();
    if (!isRecord(payload) || typeof payload['url'] !== 'string') {
      return 'No checkout URL returned from server.';
    }
    url = payload['url'];
  } catch {
    return 'Unable to reach payment service. Check your internet connection.';
  }

  await openBillingUrl(url, 'Complete your AGI plan purchase', onClosed);
  return null;
}

export async function openBillingPortal(
  onClosed?: () => void | Promise<void>,
): Promise<string | null> {
  let request: ReturnType<typeof createManagedCloudRequestContext>;
  try {
    request = createManagedCloudRequestContext('Cloud billing portal');
  } catch {
    return 'Please sign in to manage your subscription.';
  }
  const ownershipBlock = stripeBillingActionBlockReason('portal');
  if (ownershipBlock) return ownershipBlock;

  let url: string;
  try {
    const res = await request.fetch(`${WEB_APP_URL}/api/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    request.assertBoundary();

    if (!res.ok) {
      const msg = await readBillingError(res, `Portal error (${res.status})`);
      request.assertBoundary();
      if (res.status === 503) {
        return 'Stripe is not configured. Please contact support.';
      }
      return msg;
    }

    const payload: unknown = await res.json();
    request.assertBoundary();
    if (!isRecord(payload) || typeof payload['url'] !== 'string') {
      return 'No portal URL returned from server.';
    }
    url = payload['url'];
  } catch {
    return 'Unable to reach billing portal. Check your internet connection.';
  }

  await openBillingUrl(url, 'Manage AGI billing', onClosed);
  return null;
}

export async function openTopUpCheckout(
  amountUsd: number,
  onClosed?: () => void | Promise<void>,
): Promise<string | null> {
  if (topUpUnitsForUsd(amountUsd) === null) {
    return `Choose a whole-dollar top-up from $${MIN_TOP_UP_AMOUNT_USD} to $${MAX_TOP_UP_AMOUNT_USD}.`;
  }

  let request: ReturnType<typeof createManagedCloudRequestContext>;
  try {
    request = createManagedCloudRequestContext('Cloud usage top-up');
  } catch {
    return 'Please sign in to buy a usage top-up.';
  }
  const ownershipBlock = stripeBillingActionBlockReason('portal');
  if (ownershipBlock) return ownershipBlock;

  let url: string;
  try {
    const res = await request.fetch(`${WEB_APP_URL}/api/billing/top-up`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `agi.topup.desktop.${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ amountUsd }),
    });
    request.assertBoundary();

    if (!res.ok) {
      const msg = await readBillingError(res, `Top-up failed (${res.status})`);
      request.assertBoundary();
      return msg;
    }

    const payload: unknown = await res.json();
    request.assertBoundary();
    if (!isRecord(payload) || typeof payload['url'] !== 'string') {
      return 'No top-up checkout URL returned from server.';
    }
    url = payload['url'];
  } catch {
    return 'Unable to reach payment service. Check your internet connection.';
  }

  await openBillingUrl(url, 'Buy an AGI usage top-up', onClosed);
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
  const request = createManagedCloudRequestContext('Cloud plan upgrade preview');
  const ownershipBlock = stripeBillingActionBlockReason('plan-change');
  if (ownershipBlock) throw new Error(ownershipBlock);

  const response = await request.fetch(`${WEB_APP_URL}/api/upgrade/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan: tierId, billingInterval: interval }),
  });
  const payload = await readBillingPayload(response);
  request.assertBoundary();

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
  const request = createManagedCloudRequestContext('Cloud plan upgrade');
  const ownershipBlock = stripeBillingActionBlockReason('plan-change');
  if (ownershipBlock) throw new Error(ownershipBlock);

  const response = await request.fetch(`${WEB_APP_URL}/api/upgrade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan: tierId,
      billingInterval: interval,
      previewToken,
    }),
  });
  const payload = await readBillingPayload(response);
  request.assertBoundary();
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
  const ownershipBlock = stripeBillingActionBlockReason('plan-change');
  if (ownershipBlock) throw new Error(ownershipBlock);
  await openBillingUrl(paymentUrl, 'Complete your AGI upgrade payment', onClosed);
}

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
