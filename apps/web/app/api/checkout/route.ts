import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveCheckoutReturnOrigin } from '@/lib/server/checkout-return-origin';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { getOptionalEnv } from '@shared/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { IDEMPOTENCY_KEY_HEADER } from '@/lib/api-gateway-policy';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  CheckoutRequestSchema,
  PlanTierSchema,
  resolveCheckoutQuantity,
} from '@/lib/validations/checkout';
import { resolveCheckoutPlan } from '@/lib/services/plan-catalog-service';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getStripeClient } from '@/lib/server/stripe-client';
import { buildCheckoutTaxParams } from '@/lib/billing/tax-policy';
import { buildCheckoutTrialParams, resolveTrialDaysForCheckout } from '@/lib/billing/trial-policy';
import {
  withdrawalConsentMessage,
  withdrawalConsentMetadata,
} from '@/lib/billing/withdrawal-consent';
import { BILLING_PLAN_CATALOG_VERSION, getPlanTrialDays } from '@agiworkforce/types';
import { getCheckoutPriceSelection } from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId, isStripeResourceMissing } from '@/lib/server/stripe-resource-ids';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';
import { getIdentityUser } from '@/lib/server/identity';
import {
  hasBillingWaitlistAccess,
  holdsLivePaidSubscription,
  waitlistAccessRequiredResponse,
} from '@/lib/server/billing-waitlist-access';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { absoluteUrl } from '@/lib/seo/site';
import { referralTrialDays } from '@/lib/services/referral-service';
import { TRIAL_REMINDER_DAYS, formatChargeAmount } from '@/lib/services/trial-reminder-service';

const CHECKOUT_SCOPE = { resolveOrganization: false } as const;

const CHECKOUT_ENABLED_RAW = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

const TRIAL_CHECKOUT_TTL_SECONDS = 3600;
const DAY_MS = 86_400_000;
const OPEN_CHECKOUT_PAGE_SIZE = 100;
const CHECKOUT_ATTEMPT_METADATA_KEY = 'checkout_attempt';
const BILLING_UNVERIFIED_MESSAGE =
  'Billing details could not be verified. No checkout was created; please retry.';
const LIVE_SUBSCRIPTION_CONFLICT_MESSAGE =
  'This account already has an active subscription with our payment provider. Open Billing to manage it, or contact support if your plan is not showing yet.';

function trialDisclosure(input: {
  trialDays: number;
  startedAt: Date;
  amountMinor: number;
  currency: string;
  billingInterval: 'monthly' | 'yearly';
  referral: boolean;
}): string {
  const endsOn = new Date(input.startedAt.getTime() + input.trialDays * DAY_MS).toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  );
  const period = input.billingInterval === 'yearly' ? 'year' : 'month';
  const price = formatChargeAmount(input.amountMinor, input.currency);
  return (
    `Your ${input.trialDays}-day free trial ends on ${endsOn}. On that date your card is ` +
    `charged ${price} plus any applicable tax, and again every ${period}, unless you cancel ` +
    `before then. ${TRIAL_REMINDER_DAYS} days before the trial ends we email you a reminder ` +
    'with a one-click cancel link, and you can also cancel any time in Settings > Billing.' +
    (input.referral
      ? ` The [referral program terms](${absoluteUrl(CANONICAL_POLICY_ROUTES.referralTerms)}) apply.`
      : '')
  );
}

async function findLiveStripeSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const statuses: Stripe.SubscriptionListParams['status'][] = ['active', 'trialing', 'past_due'];
  const pages = await Promise.all(
    statuses.map((status) => stripe.subscriptions.list({ customer: customerId, status, limit: 1 })),
  );
  for (const page of pages) {
    const subscription = page.data[0];
    if (subscription) {
      return subscription;
    }
  }
  return null;
}

async function listOpenSubscriptionCheckouts(
  stripe: Stripe,
  customerId: string,
  userId: string,
): Promise<Stripe.Checkout.Session[]> {
  const page = await stripe.checkout.sessions.list({
    customer: customerId,
    status: 'open',
    limit: OPEN_CHECKOUT_PAGE_SIZE,
  });
  return page.data.filter(
    (session) => session.mode === 'subscription' && session.metadata?.['user_id'] === userId,
  );
}

async function expireOpenCheckout(stripe: Stripe, sessionId: string): Promise<boolean> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return true;
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'expired') return true;
    if (session.status === 'complete') return false;
    throw error;
  }
}

async function expireCheckouts(
  stripe: Stripe,
  sessions: readonly Stripe.Checkout.Session[],
): Promise<boolean> {
  for (const session of sessions) {
    if (!(await expireOpenCheckout(stripe, session.id))) return false;
  }
  return true;
}

function checkoutPrecedes(
  earlier: Pick<Stripe.Checkout.Session, 'created' | 'id'>,
  later: Pick<Stripe.Checkout.Session, 'created' | 'id'>,
): boolean {
  return (
    earlier.created < later.created || (earlier.created === later.created && earlier.id < later.id)
  );
}

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  const returnOrigin = resolveCheckoutReturnOrigin(request);
  const { db, userId } = await getUserScopedDb(request, CHECKOUT_SCOPE);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  if (!CHECKOUT_ENABLED || !getOptionalEnv('STRIPE_SECRET_KEY')) {
    throw createError.validation(
      'Paid-plan checkout is not available yet. Local and BYOK are free.',
    );
  }

  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let userEmail = '';
  try {
    const identityUser = await getIdentityUser(userId);
    userEmail = identityUser?.primaryEmail ?? '';
  } catch (err) {
    logger.warn(
      { error: err, userId },
      'Could not fetch email from the identity provider; proceeding without it',
    );
  }

  const user = { id: userId, email: userEmail };

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const validationResult = CheckoutRequestSchema.safeParse(rawBody);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid request: ${errorMessages}`);
  }

  const { plan: requestedPlan, billingInterval } = validationResult.data;
  const purchasable = PlanTierSchema.safeParse(resolveCheckoutPlan(requestedPlan));
  if (!purchasable.success) {
    throw createError.validation(
      `${requestedPlan} is no longer sold self-serve. Contact sales to buy it.`,
    );
  }
  const plan = purchasable.data;
  const quantity = resolveCheckoutQuantity({ ...validationResult.data, plan });
  const requestIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() || null;
  const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
  const priceSelection = await getCheckoutPriceSelection(plan, billingInterval, country);
  if (!priceSelection) {
    throw createError.validation(
      `Checkout pricing is not configured for ${plan} ${billingInterval} in your region.`,
    );
  }
  const { priceId, currency } = priceSelection;

  let stripeCustomerId: string;
  const stripe = getStripeClient();

  type SubRow = Pick<
    SubscriptionRow,
    | 'status'
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'apple_original_transaction_id'
    | 'google_purchase_token'
    | 'current_period_end'
  >;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      'select status, plan_tier, stripe_customer_id, stripe_subscription_id, ' +
        'apple_original_transaction_id, google_purchase_token, current_period_end ' +
        'from subscriptions where user_id = $1 limit 1',
      [user.id],
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to verify existing subscription');
    throw createError
      .serviceUnavailable(
        'Billing details could not be verified. No checkout was created; please retry.',
      )
      .asUserSafe();
  }
  const existingSubscription = subRows[0] ?? null;
  const ownerPolicy = getSubscriptionBillingOwnerPolicy(existingSubscription);

  if (!holdsLivePaidSubscription(existingSubscription)) {
    let accessGranted = false;
    try {
      accessGranted = await hasBillingWaitlistAccess(db, user.id);
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to verify paid upgrade access');
      throw createError
        .serviceUnavailable('Upgrade access could not be verified. No checkout was created.')
        .asUserSafe();
    }
    if (!accessGranted) {
      return waitlistAccessRequiredResponse();
    }
  }

  if (!ownerPolicy.canStartStripeCheckout) {
    throw createError.conflict(stripeBillingOwnershipMessage(ownerPolicy, 'checkout'));
  }

  let profileRows: Array<Pick<ProfileRow, 'stripe_customer_id'>>;
  try {
    profileRows = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
      'select stripe_customer_id from profiles where id = $1 limit 1',
      [user.id],
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to verify Stripe customer');
    throw createError
      .serviceUnavailable(
        'Billing customer details could not be verified. No checkout was created; please retry.',
      )
      .asUserSafe();
  }
  const profile = profileRows[0] ?? null;

  let hadStoredStripeCustomer = false;

  async function createStripeCustomerForUser(): Promise<string> {
    let customer: Stripe.Customer;
    try {
      customer = await stripe.customers.create(
        {
          email: user.email,
          metadata: {
            user_id: user.id,
          },
        },
        { idempotencyKey: `checkout-customer:${user.id}` },
      );
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        'Failed to create Stripe customer; refusing checkout',
      );
      throw createError.serviceUnavailable(BILLING_UNVERIFIED_MESSAGE).asUserSafe();
    }

    try {
      await db.execute('update profiles set stripe_customer_id = $1 where id = $2', [
        customer.id,
        user.id,
      ]);
    } catch (error) {
      logger.error(
        { error, userId: user.id, stripeCustomerId: customer.id },
        'Created Stripe customer but could not persist the profile link',
      );
    }

    logger.info(
      { userId: user.id, customerId: customer.id },
      'Created new Stripe customer and stored in profile',
    );
    return customer.id;
  }

  if (isStripeCustomerId(profile?.stripe_customer_id)) {
    stripeCustomerId = profile.stripe_customer_id;
    hadStoredStripeCustomer = true;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from profile',
    );
  } else if (isStripeCustomerId(existingSubscription?.stripe_customer_id)) {
    stripeCustomerId = existingSubscription.stripe_customer_id;
    hadStoredStripeCustomer = true;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from subscription',
    );
  } else {
    stripeCustomerId = await createStripeCustomerForUser();
  }

  if (hadStoredStripeCustomer) {
    let liveSubscription: Stripe.Subscription | null = null;
    try {
      liveSubscription = await findLiveStripeSubscription(stripe, stripeCustomerId);
    } catch (error) {
      if (!isStripeResourceMissing(error)) {
        logger.error(
          { error, userId: user.id, customerId: stripeCustomerId },
          'Failed to verify existing Stripe subscriptions before checkout',
        );
        throw createError.serviceUnavailable(BILLING_UNVERIFIED_MESSAGE).asUserSafe();
      }

      // A stored id Stripe does not recognise, which is what every customer
      // created before the test-to-live migration became. Refusing here left
      // those accounts unable to subscribe at all, and the guard below has
      // nothing to protect: a customer this account does not have cannot be
      // billing a subscription. Drop the dead link and start a fresh customer.
      logger.warn(
        { userId: user.id, customerId: stripeCustomerId },
        'Stored Stripe customer does not exist in this account; replacing it',
      );
      hadStoredStripeCustomer = false;
      stripeCustomerId = await createStripeCustomerForUser();
    }

    if (liveSubscription) {
      logger.error(
        {
          userId: user.id,
          customerId: stripeCustomerId,
          stripeSubscriptionId: liveSubscription.id,
          stripeStatus: liveSubscription.status,
          storedStatus: existingSubscription?.status ?? null,
          storedPlanTier: existingSubscription?.plan_tier ?? null,
        },
        'Refusing checkout: Stripe is already billing a subscription for this customer',
      );
      throw createError.conflict(LIVE_SUBSCRIPTION_CONFLICT_MESSAGE);
    }
  }

  const trialDays = await resolveTrialDaysForCheckout({
    stripe,
    plan,
    userId: user.id,
    stripeCustomerId: hadStoredStripeCustomer ? stripeCustomerId : null,
    referralTrialDays: await referralTrialDays(db, user.id, plan),
    existingSubscription,
  });
  const trialParams = buildCheckoutTrialParams(trialDays);
  const checkoutStartedAt = new Date();
  const trialTerms =
    trialDays === null
      ? {}
      : {
          expires_at: Math.floor(checkoutStartedAt.getTime() / 1000) + TRIAL_CHECKOUT_TTL_SECONDS,
          custom_text: {
            submit: {
              message: trialDisclosure({
                trialDays,
                startedAt: checkoutStartedAt,
                amountMinor: priceSelection.amountMinor * quantity,
                currency,
                billingInterval,
                referral: getPlanTrialDays(plan) === null,
              }),
            },
          },
        };

  const checkoutMetadata = {
    user_id: user.id,
    plan_tier: plan,
    plan_catalog_version: String(BILLING_PLAN_CATALOG_VERSION),
    requested_seats: String(quantity),
  };

  let earlierCheckoutsSettled: boolean;
  try {
    const openCheckouts = await listOpenSubscriptionCheckouts(stripe, stripeCustomerId, user.id);
    earlierCheckoutsSettled = await expireCheckouts(
      stripe,
      openCheckouts.filter(
        (session) =>
          !requestIdempotencyKey ||
          session.metadata?.[CHECKOUT_ATTEMPT_METADATA_KEY] !== requestIdempotencyKey,
      ),
    );
  } catch (error) {
    logger.error(
      { error, userId: user.id, customerId: stripeCustomerId },
      'Failed to close open subscription checkouts before creating a new one',
    );
    throw createError.serviceUnavailable(BILLING_UNVERIFIED_MESSAGE).asUserSafe();
  }
  if (!earlierCheckoutsSettled) {
    logger.warn(
      { userId: user.id, customerId: stripeCustomerId },
      'Refusing checkout: another subscription checkout for this account just completed',
    );
    throw createError.conflict(LIVE_SUBSCRIPTION_CONFLICT_MESSAGE);
  }

  try {
    const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      locale: 'auto', // Auto-detect browser locale to prevent i18n module errors
      currency,
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      success_url: `${returnOrigin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/pricing`,
      client_reference_id: user.id, // Primary identifier for webhook
      metadata: {
        ...checkoutMetadata,
        ...withdrawalConsentMetadata(),
        ...(requestIdempotencyKey
          ? { [CHECKOUT_ATTEMPT_METADATA_KEY]: requestIdempotencyKey }
          : {}),
      },
      subscription_data: {
        metadata: { ...checkoutMetadata, ...withdrawalConsentMetadata() },
        ...trialParams.subscriptionData,
      },
      ...trialParams.session,
      ...trialTerms,
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        ...('custom_text' in trialTerms ? trialTerms.custom_text : {}),
        terms_of_service_acceptance: { message: withdrawalConsentMessage() },
      },
      allow_promotion_codes: true,
      ...buildCheckoutTaxParams({ hasExistingCustomer: true }),
    };
    const checkoutSession = requestIdempotencyKey
      ? await stripe.checkout.sessions.create(checkoutSessionParams, {
          idempotencyKey: `checkout:${user.id}:${plan}:${billingInterval}:${quantity}:${requestIdempotencyKey}`,
        })
      : await stripe.checkout.sessions.create(checkoutSessionParams);

    if (!checkoutSession.url) {
      throw createError.internal('Failed to generate checkout URL');
    }

    let siblingCompleted = false;
    try {
      const openCheckouts = await listOpenSubscriptionCheckouts(stripe, stripeCustomerId, user.id);
      siblingCompleted = !(await expireCheckouts(
        stripe,
        openCheckouts.filter(
          (session) =>
            session.id !== checkoutSession.id && checkoutPrecedes(session, checkoutSession),
        ),
      ));
    } catch (error) {
      logger.warn(
        { error, userId: user.id, sessionId: checkoutSession.id },
        'Could not close earlier subscription checkouts after creating a new one',
      );
    }
    if (siblingCompleted) {
      await expireOpenCheckout(stripe, checkoutSession.id).catch((error: unknown) => {
        logger.error(
          { error, userId: user.id, sessionId: checkoutSession.id },
          'Could not expire a checkout created while another one completed',
        );
      });
      throw createError.conflict(LIVE_SUBSCRIPTION_CONFLICT_MESSAGE);
    }

    await recordAuditEvent({
      userId: user.id,
      eventType: 'checkout_started',
      request,
      detail: {
        resourceType: 'subscription',
        planTier: plan,
        billingInterval,
        source: 'checkout',
      },
    });

    return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      logger.error(
        {
          userId: user.id,
          priceId,
          plan,
          stripeErrorType: error.type,
          stripeErrorCode: error.code,
          stripeErrorParam: error.param,
          stripeErrorMessage: error.message,
        },
        'Stripe rejected checkout session creation',
      );
    }

    if (error instanceof Stripe.errors.StripeCardError) {
      throw createError.validation(error.message);
    } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      throw createError.validation('Invalid checkout configuration. Please contact support.');
    } else if (error instanceof Stripe.errors.StripeAuthenticationError) {
      throw createError
        .serviceUnavailable('Payment service temporarily unavailable. Please try again later.')
        .asUserSafe();
    } else if (error instanceof Stripe.errors.StripeRateLimitError) {
      throw createError.rateLimit('Too many requests. Please wait a moment and try again.');
    } else if (error instanceof Stripe.errors.StripeConnectionError) {
      throw createError
        .serviceUnavailable('Unable to connect to payment service. Please try again.')
        .asUserSafe();
    }

    throw error;
  }
}

export const POST = withCorsRoute(
  withErrorHandler(handleCheckout, {
    idempotencyKey: 'optional',
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.checkout',
  }),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
