
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { loadStripe } from '@stripe/stripe-js';
import {
  isPerSeatBillingPlan,
  MIN_PURCHASABLE_SEATS,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';

function seatsForPlan(plan: SelfServePaidPlanTier, seats: number | undefined): number | undefined {
  if (!isPerSeatBillingPlan(plan)) return undefined;
  if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < MIN_PURCHASABLE_SEATS) {
    throw new Error(`${plan} is billed per seat; choose how many seats to buy.`);
  }
  return seats;
}

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
      'Idempotency-Key': `agi.checkout.web.${crypto.randomUUID()}`,
    }),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractErrorMessage(error, 'Failed to open billing portal'));
  }

  const { url } = await response.json();

  window.location.href = url;
}

export function isStripeConfigured(): boolean {
  const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
  return !!publishableKey && publishableKey.startsWith('pk_');
}

export function getStripeConfig() {
  return {
    publishableKey: process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
      ? `${process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'].substring(0, 20)}...`
      : 'Not configured',
    isConfigured: isStripeConfigured(),
  };
}

export async function upgradeToProPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'pro' });
}

export async function upgradeToMaxPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'max' });
}

export async function upgradeToMax15xPlan(data: {
  userId: string;
  userEmail: string;
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'max_15x' });
}

export async function upgradeToBasicPlan(data: {
  userId: string;
  userEmail: string;
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'basic' });
}

async function upgradeToPlan(data: {
  userId: string;
  userEmail: string;
  plan: SelfServePaidPlanTier;
  billingPeriod?: 'monthly' | 'yearly';
  seats?: number;
}): Promise<void> {
  void data.userId;
  void data.userEmail;
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to upgrade.');
  }

  const billingInterval = data.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  const seats = seatsForPlan(data.plan, data.seats);

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({
      plan: data.plan,
      billingInterval,
      ...(seats === undefined ? {} : { seats }),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      extractErrorMessage(error, `Failed to create ${data.plan.toUpperCase()} subscription`),
    );
  }

  const { url } = await response.json();

  if (url) {
    window.location.href = url;
  } else {
    throw new Error('No checkout URL received from server');
  }
}

export async function startPlanCheckout(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
}): Promise<void> {
  return upgradeToPlan({
    userId: '',
    userEmail: '',
    plan: data.plan,
    billingPeriod: data.billingInterval,
    ...(data.seats === undefined ? {} : { seats: data.seats }),
  });
}

export async function startTopUpCheckout(amountUsd: number): Promise<void> {
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('User not authenticated. Please log in to buy a top-up.');

  const response = await fetch('/api/billing/top-up', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'Idempotency-Key': `agi.topup.web.${crypto.randomUUID()}`,
    }),
    body: JSON.stringify({ amountUsd }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    url?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not start top-up checkout.'));
  }
  if (typeof result.url !== 'string' || !result.url.startsWith('https://')) {
    throw new Error('Top-up checkout returned an invalid payment URL.');
  }
  window.location.href = result.url;
}

export async function upgradeToTeamPlan(data: {
  seats: number;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({
    userId: '',
    userEmail: '',
    plan: 'team',
    seats: data.seats,
    ...(data.billingPeriod ? { billingPeriod: data.billingPeriod } : {}),
  });
}

export async function previewUpgrade(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
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
    body: JSON.stringify({
      plan: data.plan,
      billingInterval,
      ...(() => {
        const seats = seatsForPlan(data.plan, data.seats);
        return seats === undefined ? {} : { seats };
      })(),
    }),
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

export async function upgradePlanMidCycle(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
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
      ...(() => {
        const seats = seatsForPlan(data.plan, data.seats);
        return seats === undefined ? {} : { seats };
      })(),
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
