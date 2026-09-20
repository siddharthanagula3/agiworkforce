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
import { buildCheckoutTrialParams, resolveCheckoutTrialDays } from '@/lib/billing/trial-policy';
import { getPlanTrialDays, isFreeOfChargePlanTier } from '@agiworkforce/types';
import { getCheckoutPriceSelection } from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';
import { getIdentityUser } from '@/lib/server/identity';
import { hasBillingWaitlistAccess } from '@/lib/server/billing-waitlist-access';

const CHECKOUT_SCOPE = { resolveOrganization: false } as const;

const CHECKOUT_ENABLED_RAW = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

// Stripe answers `resource_missing` when the id names nothing in this account.
// For a stored customer that is a definite answer, not an outage: the customer
// is gone, so it cannot be carrying a subscription.
function isResourceMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'resource_missing'
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

async function customerHasSubscriptionHistory(
  stripe: Stripe,
  customerId: string,
  userId: string,
): Promise<boolean | null> {
  try {
    const page = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
    return page.data.length > 0;
  } catch (error) {
    logger.warn(
      { error, userId, customerId },
      'Trial eligibility could not be verified; checkout continues without a trial',
    );
    return null;
  }
}

async function resolveTrialDaysForCheckout(input: {
  stripe: Stripe;
  plan: string;
  userId: string;
  stripeCustomerId: string | null;
  existingSubscription: Pick<
    SubscriptionRow,
    'stripe_subscription_id' | 'apple_original_transaction_id' | 'google_purchase_token'
  > | null;
}): Promise<number | null> {
  const trialDays = getPlanTrialDays(input.plan);
  if (trialDays === null) return null;
  const existing = input.existingSubscription;
  return resolveCheckoutTrialDays({
    trialDays,
    priorStoreOrStripeSubscription: Boolean(
      existing?.stripe_subscription_id ||
      existing?.apple_original_transaction_id ||
      existing?.google_purchase_token,
    ),
    customerHasSubscriptionHistory: input.stripeCustomerId
      ? await customerHasSubscriptionHistory(input.stripe, input.stripeCustomerId, input.userId)
      : false,
  });
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

  let stripeCustomerId: string | null = null;
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

  if (!existingSubscription || isFreeOfChargePlanTier(existingSubscription.plan_tier)) {
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
      return NextResponse.json(
        {
          error: {
            code: 'waitlist_access_required',
            message:
              'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.',
          },
        },
        { status: 403 },
      );
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

  async function createStripeCustomerForUser(): Promise<string | null> {
    try {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          metadata: {
            user_id: user.id,
          },
        },
        { idempotencyKey: `checkout-customer:${user.id}` },
      );

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
    } catch (err) {
      logger.error(
        { error: err, userId: user.id },
        'Failed to create Stripe customer, proceeding without customer ID',
      );
      // Continue without customer ID - Stripe will create one during checkout
      return null;
    }
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

  if (hadStoredStripeCustomer && stripeCustomerId) {
    let liveSubscription: Stripe.Subscription | null = null;
    try {
      liveSubscription = await findLiveStripeSubscription(stripe, stripeCustomerId);
    } catch (error) {
      if (!isResourceMissing(error)) {
        logger.error(
          { error, userId: user.id, customerId: stripeCustomerId },
          'Failed to verify existing Stripe subscriptions before checkout',
        );
        throw createError
          .serviceUnavailable(
            'Billing details could not be verified. No checkout was created; please retry.',
          )
          .asUserSafe();
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
      throw createError.conflict(
        'This account already has an active subscription with our payment provider. Open Billing to manage it, or contact support if your plan is not showing yet.',
      );
    }
  }

  const trialDays = await resolveTrialDaysForCheckout({
    stripe,
    plan,
    userId: user.id,
    stripeCustomerId: hadStoredStripeCustomer ? stripeCustomerId : null,
    existingSubscription,
  });
  const trialParams = buildCheckoutTrialParams(trialDays);

  const checkoutMetadata = {
    user_id: user.id,
    plan_tier: plan,
    requested_seats: String(quantity),
  };

  try {
    const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      locale: 'auto', // Auto-detect browser locale to prevent i18n module errors
      currency,
      customer: stripeCustomerId || undefined, // Use existing customer if available
      customer_email: stripeCustomerId ? undefined : user.email, // Only set if no customer
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      success_url: `${returnOrigin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/pricing`,
      client_reference_id: user.id, // Primary identifier for webhook
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: checkoutMetadata,
        ...trialParams.subscriptionData,
      },
      ...trialParams.session,
      allow_promotion_codes: true,
      ...buildCheckoutTaxParams({ hasExistingCustomer: Boolean(stripeCustomerId) }),
    };
    const checkoutSession = requestIdempotencyKey
      ? await stripe.checkout.sessions.create(checkoutSessionParams, {
          idempotencyKey: `checkout:${user.id}:${plan}:${quantity}:${requestIdempotencyKey}`,
        })
      : await stripe.checkout.sessions.create(checkoutSessionParams);

    if (!checkoutSession.url) {
      throw createError.internal('Failed to generate checkout URL');
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

    return NextResponse.json({ url: checkoutSession.url });
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
