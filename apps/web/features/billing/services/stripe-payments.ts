/**
 * Stripe Payment Integration Service
 * Handles all Stripe-related operations for AI employee subscriptions
 *
 * UPDATED: January 17, 2026 - Added authorization headers to all API calls
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { loadStripe } from '@stripe/stripe-js';
import type { SelfServePaidPlanTier } from '@agiworkforce/types';

// Employee purchase functions removed - hiring is now free

/**
 * Extract a human-readable message from an API error response. Routes
 * wrapped in withErrorHandler (apps/web/lib/error-handler.ts) return
 * `{ error: { code, message }, requestId }` - `error` is an OBJECT, not a
 * string. Reading `body.error` directly and passing it to `new Error(...)`
 * silently stringifies it to the literal text "[object Object]" (confirmed
 * live on the pricing page's "Get Pro" button before this fix). Falls back
 * to a plain-string `error` field for any route not yet on that wrapper.
 */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err) return err;
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return fallback;
}

function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export class CheckoutRequiredError extends Error {
  readonly amountDueNowCents: number | null;
  readonly currency: string | null;

  constructor(
    message: string,
    amountDueNowCents: number | null = null,
    currency: string | null = null,
  ) {
    super(message);
    this.name = 'CheckoutRequiredError';
    this.amountDueNowCents = amountDueNowCents;
    this.currency = currency;
  }
}

/**
 * Open Stripe Customer Portal for subscription management
 */
// Updated: Jan 17th 2026 - Added authorization header
export async function openBillingPortal(): Promise<void> {
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to access billing.');
  }

  const response = await fetch('/api/portal', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractErrorMessage(error, 'Failed to open billing portal'));
  }

  const { url } = await response.json();

  // Redirect to Stripe Customer Portal
  window.location.href = url;
}

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
  const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
  return !!publishableKey && publishableKey.startsWith('pk_');
}

/**
 * Get Stripe configuration status for debugging
 */
export function getStripeConfig() {
  return {
    publishableKey: process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
      ? `${process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'].substring(0, 20)}...`
      : 'Not configured',
    isConfigured: isStripeConfigured(),
  };
}

/**
 * Create Pro Plan subscription and redirect to Stripe Checkout
 */
export async function upgradeToProPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'pro' });
}

/**
 * Create Max Plan subscription and redirect to Stripe Checkout
 */
export async function upgradeToMaxPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'max' });
}

/** Create Max 15x subscription and redirect to Stripe Checkout. */
export async function upgradeToMax15xPlan(data: {
  userId: string;
  userEmail: string;
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'max_15x' });
}

/**
 * Create Basic Plan subscription and redirect to Stripe Checkout. The server
 * derives currency from trusted deployment geolocation; clients never choose
 * the charged currency.
 */
export async function upgradeToBasicPlan(data: {
  userId: string;
  userEmail: string;
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'basic' });
}

/**
 * Generic function to upgrade to any plan
 */
async function upgradeToPlan(data: {
  userId: string;
  userEmail: string;
  plan: SelfServePaidPlanTier;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  void data.userId;
  void data.userEmail;
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to upgrade.');
  }

  const billingInterval = data.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({
      plan: data.plan,
      billingInterval,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      extractErrorMessage(error, `Failed to create ${data.plan.toUpperCase()} subscription`),
    );
  }

  const { url } = await response.json();

  // Redirect to Stripe Checkout
  if (url) {
    window.location.href = url;
  } else {
    throw new Error('No checkout URL received from server');
  }
}

export async function startPlanCheckout(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({
    userId: '',
    userEmail: '',
    plan: data.plan,
    billingPeriod: data.billingInterval,
  });
}

/**
 * Read-only preview of a mid-cycle upgrade's immediate prorated charge, so the
 * UI can show "you'll be charged $X today" and get explicit confirmation BEFORE
 * `upgradePlanMidCycle` actually charges the saved card. Returns the amount due
 * now in the subscription's billing currency.
 */
export async function previewUpgrade(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
}): Promise<{ amountDueNowCents: number; currency: string; previewToken: string }> {
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('User not authenticated. Please log in to upgrade.');

  const billingInterval = data.billingInterval ?? 'monthly';
  const response = await fetch('/api/upgrade/preview', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({ plan: data.plan, billingInterval }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    amountDueNowCents?: unknown;
    currency?: unknown;
    previewToken?: unknown;
    error?: unknown;
    checkout?: {
      amountDueNowCents?: unknown;
      currency?: unknown;
    };
  };

  if (!response.ok) {
    if (extractErrorCode(result) === 'checkout_required') {
      const checkoutAmount = result.checkout?.amountDueNowCents;
      const checkoutCurrency = result.checkout?.currency;
      throw new CheckoutRequiredError(
        extractErrorMessage(result, 'Start a new checkout to continue.'),
        typeof checkoutAmount === 'number' ? checkoutAmount : null,
        typeof checkoutCurrency === 'string' ? checkoutCurrency : null,
      );
    }
    throw new Error(extractErrorMessage(result, `Could not preview the ${data.plan} upgrade`));
  }
  if (
    typeof result.amountDueNowCents !== 'number' ||
    typeof result.currency !== 'string' ||
    typeof result.previewToken !== 'string' ||
    !result.previewToken
  ) {
    throw new Error('Upgrade preview returned an unexpected response.');
  }
  return {
    amountDueNowCents: result.amountDueNowCents,
    currency: result.currency,
    previewToken: result.previewToken,
  };
}

/**
 * Upgrade an active subscription immediately. The server applies unused-time
 * value to the new full-cycle invoice and activates entitlements only after
 * successful payment.
 */
export async function upgradePlanMidCycle(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  previewToken: string;
}): Promise<{ activation: 'webhook_pending' }> {
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('User not authenticated. Please log in to upgrade.');

  const billingInterval = data.billingInterval ?? 'monthly';
  const response = await fetch('/api/upgrade', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({
      plan: data.plan,
      billingInterval,
      previewToken: data.previewToken,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    activation?: unknown;
    paymentActionRequired?: unknown;
    clientSecret?: unknown;
    error?: unknown;
  };

  if (response.status === 402 && result.paymentActionRequired === true) {
    if (typeof result.clientSecret !== 'string' || !result.clientSecret) {
      throw new Error('Payment authentication is required. Open billing and try again.');
    }
    const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
    if (!publishableKey?.startsWith('pk_')) {
      throw new Error('Payment authentication is unavailable. Please contact support.');
    }
    const stripe = await loadStripe(publishableKey);
    if (!stripe) throw new Error('Payment authentication could not be loaded. Please try again.');

    const { error, paymentIntent } = await stripe.confirmPayment({
      clientSecret: result.clientSecret,
      redirect: 'if_required',
    });
    if (error) throw new Error(error.message || 'Payment authentication failed.');
    const paymentStatus =
      paymentIntent && typeof paymentIntent === 'object' && 'status' in paymentIntent
        ? paymentIntent.status
        : null;
    if (typeof paymentStatus !== 'string' || !['processing', 'succeeded'].includes(paymentStatus)) {
      throw new Error('Payment was not completed. Your current plan is unchanged.');
    }
    return { activation: 'webhook_pending' };
  }

  if (!response.ok) {
    if (extractErrorCode(result) === 'checkout_required') {
      throw new CheckoutRequiredError(
        extractErrorMessage(result, 'Start a new checkout to continue.'),
      );
    }
    throw new Error(extractErrorMessage(result, `Failed to upgrade to ${data.plan}`));
  }

  if (result.activation !== 'webhook_pending') {
    throw new Error(
      'Upgrade payment status could not be verified. Your current plan is unchanged.',
    );
  }
  return { activation: 'webhook_pending' };
}

/**
 * Create Enterprise plan inquiry (Contact sales)
 */
export async function contactEnterpriseSales(data: {
  userId: string;
  userEmail: string;
  userName?: string;
  companyName?: string;
  message?: string;
}): Promise<void> {
  // In a real implementation, this would send an email or create a lead in CRM
  // For now, we'll just open the contact page or show a success message

  // You can implement this to send to your CRM or email service
  // For now, redirect to contact page with pre-filled info
  const params = new URLSearchParams({
    email: data.userEmail,
    plan: 'enterprise',
    ...(data.userName && { name: data.userName }),
    ...(data.companyName && { company: data.companyName }),
  });

  window.location.href = `/contact-sales?${params.toString()}`;
}
