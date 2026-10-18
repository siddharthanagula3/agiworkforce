import { getAuthToken } from '@shared/lib/get-auth-token';
import { queryClient, queryKeys } from '@shared/stores/query-client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  continueInBrowser,
  type BrowserHandoffOutcome,
} from '@/features/desktop-host/lib/browser-handoff';
import { loadStripe } from '@stripe/stripe-js/pure';
import {
  getBillingPlanPricing,
  isPerSeatBillingPlan,
  MIN_PURCHASABLE_SEATS,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import {
  apiErrorCode as extractErrorCode,
  apiErrorMessage as extractErrorMessage,
} from '../lib/api-error';
import { rememberPendingCheckout } from '../lib/pending-checkout';
import { WAITLIST_ACCESS_REQUIRED_CODE } from '@/lib/validations/upgrade-waitlist';

export class UpgradeAccessRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpgradeAccessRequiredError';
  }
}

const HOSTED_BILLING_DETAIL = {
  checkout:
    'Checkout opened in your browser. Pay there, then come back: this window reads your plan again when you return.',
  portal:
    'The billing portal opened in your browser. Make your changes there, then come back: this window reads your plan again when you return.',
  topUp:
    'Top-up checkout opened in your browser. Pay there, then come back: this window reads your balance again when you return.',
} as const;

async function rereadPlan(): Promise<void> {
  await Promise.all([
    useBillingStore.getState().refreshUser(),
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.all() }),
  ]);
}

/**
 * Stripe's pages are not hosted in the desktop window, so the shell opens them
 * in the browser and this window waits. In a browser the page itself goes.
 */
function goToHostedBilling(
  url: string,
  page: keyof typeof HOSTED_BILLING_DETAIL,
): BrowserHandoffOutcome {
  return continueInBrowser(url, { detail: HOSTED_BILLING_DETAIL[page], refresh: rereadPlan });
}

function seatsForPlan(plan: SelfServePaidPlanTier, seats: number | undefined): number | undefined {
  if (!isPerSeatBillingPlan(plan)) return undefined;
  if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < MIN_PURCHASABLE_SEATS) {
    throw new Error(`${plan} is billed per seat; choose how many seats to buy.`);
  }
  return seats;
}

export interface CheckoutTrialTerms {
  days: number;
  convertsAt: string;
  amountCents: number;
}

export class CheckoutRequiredError extends Error {
  readonly amountDueNowCents: number | null;
  readonly currency: string | null;
  readonly trial: CheckoutTrialTerms | null;

  constructor(
    message: string,
    amountDueNowCents: number | null = null,
    currency: string | null = null,
    trial: CheckoutTrialTerms | null = null,
  ) {
    super(message);
    this.name = 'CheckoutRequiredError';
    this.amountDueNowCents = amountDueNowCents;
    this.currency = currency;
    this.trial = trial;
  }
}

function parseCheckoutTrial(
  value: unknown,
  recurringAmountCents: unknown,
): CheckoutTrialTerms | null {
  if (!value || typeof value !== 'object' || typeof recurringAmountCents !== 'number') return null;
  const raw = value as Record<string, unknown>;
  const days = raw['days'];
  const convertsAt = raw['convertsAt'];
  if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return null;
  if (typeof convertsAt !== 'string' || Number.isNaN(Date.parse(convertsAt))) return null;
  return { days, convertsAt, amountCents: recurringAmountCents };
}

export interface SavedPaymentMethod {
  id: string;
  type: string;
  isDefault: boolean;
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
}

interface PaymentMethodApiEntry {
  id?: unknown;
  type?: unknown;
  is_default?: unknown;
  card?: { brand?: unknown; last4?: unknown; exp_month?: unknown; exp_year?: unknown };
}

/**
 * The method Stripe will actually charge, so the upgrade screen can name it
 * instead of saying "your saved card" and hoping.
 */
export async function fetchSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('Your session has expired. Sign in again to see your payment method.');
  }

  const response = await fetch('/api/billing/payment-methods', {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractErrorMessage(body, 'We could not load your payment method.'));
  }

  const body = (await response.json().catch(() => ({}))) as {
    payment_methods?: PaymentMethodApiEntry[];
  };
  return (body.payment_methods ?? []).flatMap((entry) => {
    if (typeof entry.id !== 'string') return [];
    const card =
      entry.card && typeof entry.card.last4 === 'string'
        ? {
            brand: typeof entry.card.brand === 'string' ? entry.card.brand : 'card',
            last4: entry.card.last4,
            expMonth: typeof entry.card.exp_month === 'number' ? entry.card.exp_month : 0,
            expYear: typeof entry.card.exp_year === 'number' ? entry.card.exp_year : 0,
          }
        : null;
    return [
      {
        id: entry.id,
        type: typeof entry.type === 'string' ? entry.type : 'card',
        isDefault: entry.is_default === true,
        card,
      },
    ];
  });
}

export async function openBillingPortal(
  returnPath?: string,
  flow?: 'cancel',
): Promise<BrowserHandoffOutcome> {
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to access billing.');
  }

  const response = await fetch('/api/portal', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'Idempotency-Key': `agi.portal.web.${crypto.randomUUID()}`,
    }),
    body: JSON.stringify({ ...(returnPath ? { returnPath } : {}), ...(flow ? { flow } : {}) }),
  });

  const result = (await response.json().catch(() => null)) as { url?: unknown } | null;
  if (!response.ok) {
    throw new Error(extractErrorMessage(result, 'Failed to open billing portal'));
  }
  if (typeof result?.url !== 'string' || !result.url) {
    throw new Error('The billing portal did not return a link. Please try again.');
  }

  return goToHostedBilling(result.url, 'portal');
}

export async function upgradeToProPlan(): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({ plan: 'pro' });
}

export async function upgradeToMaxPlan(): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({ plan: 'max' });
}

export async function upgradeToMax15xPlan(): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({ plan: 'max_15x' });
}

export async function upgradeToBasicPlan(): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({ plan: 'basic' });
}

async function upgradeToPlan(data: {
  plan: SelfServePaidPlanTier;
  billingPeriod?: 'monthly' | 'yearly';
  seats?: number;
  premiumSeats?: number;
}): Promise<BrowserHandoffOutcome> {
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
      'Idempotency-Key': `agi.checkout.web.${crypto.randomUUID()}`,
    }),
    body: JSON.stringify({
      plan: data.plan,
      billingInterval,
      ...(seats === undefined ? {} : { seats }),
      ...(seats !== undefined && data.premiumSeats ? { premiumSeats: data.premiumSeats } : {}),
    }),
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => ({}));
    const message = extractErrorMessage(
      error,
      `Failed to create ${getBillingPlanPricing(data.plan).label} subscription`,
    );
    if (extractErrorCode(error) === WAITLIST_ACCESS_REQUIRED_CODE) {
      throw new UpgradeAccessRequiredError(message);
    }
    throw new Error(message);
  }

  const { url, sessionId } = (await response.json()) as { url?: string; sessionId?: unknown };

  if (!url) throw new Error('No checkout URL received from server');
  if (typeof sessionId === 'string') rememberPendingCheckout(sessionId, data.plan);
  return goToHostedBilling(url, 'checkout');
}

export async function startPlanCheckout(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
}): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({
    plan: data.plan,
    billingPeriod: data.billingInterval,
    ...(data.seats === undefined ? {} : { seats: data.seats }),
  });
}

export async function startTopUpCheckout(amountUsd: number): Promise<BrowserHandoffOutcome> {
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
  return goToHostedBilling(result.url, 'topUp');
}

export async function upgradeToTeamPlan(data: {
  seats: number;
  premiumSeats?: number;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<BrowserHandoffOutcome> {
  return upgradeToPlan({
    plan: 'team',
    seats: data.seats,
    ...(data.premiumSeats ? { premiumSeats: data.premiumSeats } : {}),
    ...(data.billingPeriod ? { billingPeriod: data.billingPeriod } : {}),
  });
}

/**
 * The itemized charge, so the dialog can show a receipt rather than one number.
 * Mirrors what Stripe will invoice: a line per proration, then subtotal, tax and
 * the total actually taken today.
 */
export interface UpgradeChargeBreakdown {
  lineItems: { description: string; amountCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  /** Signed as Stripe signs it: positive is owed and adds to what is taken. */
  appliedBalanceCents: number;
  totalDueTodayCents: number;
  creditToBalanceCents: number;
  renewsAt: string | null;
}

export interface UpgradePromotionSummary {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
}

export interface UpgradePreviewResult {
  amountDueNowCents: number;
  currency: string;
  previewToken: string;
  /** Null when the server sent no breakdown; the dialog then shows the total alone. */
  charge: UpgradeChargeBreakdown | null;
  promotion: UpgradePromotionSummary | null;
  replacesScheduledChange: boolean;
  grandfatheredNotice: string | null;
}

function parsePromotion(value: unknown): UpgradePromotionSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw['code'] !== 'string' || typeof raw['duration'] !== 'string') return null;
  const numberOrNull = (entry: unknown) => (typeof entry === 'number' ? entry : null);
  return {
    code: raw['code'],
    percentOff: numberOrNull(raw['percentOff']),
    amountOffCents: numberOrNull(raw['amountOffCents']),
    currency: typeof raw['currency'] === 'string' ? raw['currency'] : null,
    duration: raw['duration'],
    durationInMonths: numberOrNull(raw['durationInMonths']),
  };
}

function parseChargeBreakdown(value: unknown): UpgradeChargeBreakdown | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['subtotalCents'] !== 'number' ||
    typeof raw['taxCents'] !== 'number' ||
    typeof raw['totalDueTodayCents'] !== 'number' ||
    !Array.isArray(raw['lineItems'])
  ) {
    return null;
  }
  const lineItems = raw['lineItems']
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter(
      (item) => typeof item['description'] === 'string' && typeof item['amountCents'] === 'number',
    )
    .map((item) => ({
      description: item['description'] as string,
      amountCents: item['amountCents'] as number,
    }));

  const discountCents = typeof raw['discountCents'] === 'number' ? raw['discountCents'] : 0;
  const totalCents =
    typeof raw['totalCents'] === 'number'
      ? raw['totalCents']
      : raw['subtotalCents'] - discountCents + raw['taxCents'];
  const appliedBalanceCents =
    typeof raw['appliedBalanceCents'] === 'number' ? raw['appliedBalanceCents'] : 0;

  return {
    lineItems,
    subtotalCents: raw['subtotalCents'],
    discountCents,
    taxCents: raw['taxCents'],
    totalCents,
    appliedBalanceCents,
    totalDueTodayCents: raw['totalDueTodayCents'],
    creditToBalanceCents:
      typeof raw['creditToBalanceCents'] === 'number' ? raw['creditToBalanceCents'] : 0,
    renewsAt: typeof raw['renewsAt'] === 'string' ? raw['renewsAt'] : null,
  };
}

export async function previewUpgrade(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
  promotionCode?: string;
}): Promise<UpgradePreviewResult> {
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
      ...(data.promotionCode ? { promotionCode: data.promotionCode } : {}),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    amountDueNowCents?: unknown;
    currency?: unknown;
    previewToken?: unknown;
    charge?: unknown;
    promotion?: unknown;
    replacesScheduledChange?: unknown;
    grandfatheredNotice?: unknown;
    error?: unknown;
    checkout?: {
      amountDueNowCents?: unknown;
      currency?: unknown;
      recurringAmountCents?: unknown;
      trial?: unknown;
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
        parseCheckoutTrial(result.checkout?.trial, result.checkout?.recurringAmountCents),
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
    charge: parseChargeBreakdown(result.charge),
    promotion: parsePromotion(result.promotion),
    replacesScheduledChange: result.replacesScheduledChange === true,
    grandfatheredNotice:
      typeof result.grandfatheredNotice === 'string' && result.grandfatheredNotice
        ? result.grandfatheredNotice
        : null,
  };
}

export async function upgradePlanMidCycle(data: {
  plan: SelfServePaidPlanTier;
  billingInterval?: 'monthly' | 'yearly';
  seats?: number;
  previewToken: string;
  promotionCode?: string;
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
      ...(data.promotionCode ? { promotionCode: data.promotionCode } : {}),
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

    // `redirect: 'if_required'` still hands off to the issuer's page when the
    // card demands a full redirect rather than an inline challenge, and Stripe
    // refuses to confirm at all without somewhere to come back to. Returning to
    // /pricing puts the user where they started, on a page that re-reads the
    // plan when it regains focus.
    const { error, paymentIntent } = await stripe.confirmPayment({
      clientSecret: result.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/pricing` },
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
