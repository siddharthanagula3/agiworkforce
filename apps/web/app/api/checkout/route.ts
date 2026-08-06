// apps/web/app/api/checkout/route.ts
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { getOptionalEnv, requireEnv } from '@shared/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CheckoutRequestSchema, resolveCheckoutQuantity } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { getCheckoutPriceSelection } from '@/lib/server/localized-pricing-service';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { isSelfServePaidPlanTier, tierAtLeast } from '@agiworkforce/types';
import { recordAuditEvent } from '@/lib/security-audit';

// Lazy-initialize Stripe client to avoid build-time errors when env vars aren't set
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  return stripeClient;
}

// Paid-plan checkout (2026-07-04): open by default, matching the
// managed-compute public-alpha decision (2026-06-27, lib/managed-compute-gate.ts).
// The env var is retained ONLY as an incident-response kill-switch: set
// STRIPE_CHECKOUT_ENABLED=0 (or 'false'/'off') to re-gate. Any other value
// (including unset) keeps checkout open.
const CHECKOUT_ENABLED_RAW = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);

  // Authenticate the bearer/cookie principal before the CSRF helper treats a
  // Desktop bearer request as exempt from cookie-origin CSRF validation.
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Reject checkout requests when the incident-response kill-switch
  // (STRIPE_CHECKOUT_ENABLED=0/false/off) has been set, OR when Stripe isn't
  // actually configured (STRIPE_SECRET_KEY unset) despite checkout being left
  // "open" by default. Checked BEFORE any DB/Clerk work so a deployment with
  // no Stripe env degrades to this honest message instead of requireEnv()
  // throwing deep inside getStripe() and surfacing to the user as an opaque
  // 500 (confirmed live on prod: STRIPE_CHECKOUT_ENABLED unset + no
  // STRIPE_SECRET_KEY produced a 500 on "Get Pro"/"Get Max" instead of this).
  if (!CHECKOUT_ENABLED || !getOptionalEnv('STRIPE_SECRET_KEY')) {
    throw createError.validation(
      'Paid-plan checkout is not available yet. Local and BYOK are free; managed cloud is in public alpha.',
    );
  }

  // Rate limiting: 10 checkouts per minute per user
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Fetch the user's email from Clerk so Stripe customers are created with a
  // real address. auth() only returns userId for session-cookie requests;
  // email is only present on Bearer-token paths. clerkClient().users.getUser
  // is the reliable cross-path source.
  let userEmail = '';
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const clerkUser = await (await clerkClient()).users.getUser(userId);
    userEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      '';
  } catch (err) {
    logger.warn({ error: err, userId }, 'Could not fetch email from Clerk; proceeding without it');
  }

  const db = getNeonDb();
  const user = { id: userId, email: userEmail };

  // Type-safe request body parsing with Zod validation
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  // Validate request body against schema - provides strict type checking and sanitization
  const validationResult = CheckoutRequestSchema.safeParse(rawBody);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid request: ${errorMessages}`);
  }

  const { plan, billingInterval } = validationResult.data;
  // Per-seat plans (Team) bill unit price x quantity. The schema has already
  // refused a seat count on per-account plans and required one on per-seat
  // plans, so this is 1 for everything except a validated Team purchase.
  const quantity = resolveCheckoutQuantity(validationResult.data);
  const requestIdempotencyKey = request.headers.get('idempotency-key')?.trim() || null;
  if (requestIdempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(requestIdempotencyKey)) {
    throw createError.validation('Idempotency-Key must be 8-128 URL-safe characters.');
  }
  const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || 'US';
  const priceSelection = await getCheckoutPriceSelection(plan, billingInterval, country);
  if (!priceSelection) {
    throw createError.validation(
      `Checkout pricing is not configured for ${plan} ${billingInterval} in your region.`,
    );
  }
  const { priceId, currency } = priceSelection;

  // Get or create Stripe customer to prevent duplicate customers
  let stripeCustomerId: string | null = null;
  const stripe = getStripe();

  // If user already has an active subscription, do NOT create a new subscription via Checkout.
  // Route them to the Billing Portal instead to prevent duplicate subscriptions / double billing.
  type SubRow = Pick<
    SubscriptionRow,
    | 'status'
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'apple_original_transaction_id'
    | 'google_purchase_token'
  >;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      'select status, plan_tier, stripe_customer_id, stripe_subscription_id, ' +
        'apple_original_transaction_id, google_purchase_token ' +
        'from subscriptions where user_id = $1 limit 1',
      [user.id],
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to verify existing subscription');
    throw createError.serviceUnavailable(
      'Billing details could not be verified. No checkout was created; please retry.',
    );
  }
  const existingSubscription = subRows[0] ?? null;

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const hasActiveSubscription =
    !!existingSubscription &&
    existingSubscription.plan_tier !== 'free' &&
    activeStatuses.has(existingSubscription.status) &&
    isStripeSubscriptionId(existingSubscription.stripe_subscription_id);
  const replacesUnlinkedEntitlement =
    !!existingSubscription &&
    existingSubscription.plan_tier !== 'free' &&
    activeStatuses.has(existingSubscription.status) &&
    !isStripeSubscriptionId(existingSubscription.stripe_subscription_id);

  // An unlinked paid row is normally a manually provisioned entitlement that
  // checkout may replace. A row carrying a store identifier is NOT that: it is
  // a live Apple/Google subscription that only the store can cancel. Replacing
  // it here would leave the customer paying the store AND Stripe, and the
  // downgrade guard below would not catch it because an equal-or-higher tier
  // is permitted.
  if (
    replacesUnlinkedEntitlement &&
    (existingSubscription.apple_original_transaction_id ||
      existingSubscription.google_purchase_token)
  ) {
    throw createError.conflict(
      'This subscription is billed by the App Store or Play Store. Manage or cancel it there before subscribing on the web.',
    );
  }

  if (
    replacesUnlinkedEntitlement &&
    isSelfServePaidPlanTier(existingSubscription.plan_tier) &&
    !tierAtLeast(plan, existingSubscription.plan_tier)
  ) {
    throw createError.conflict(
      'Use billing management to downgrade. Checkout cannot replace an existing entitlement with a lower plan.',
    );
  }

  if (hasActiveSubscription) {
    throw createError.conflict(
      'Use the in-app upgrade flow so payment proration and existing usage are carried safely.',
    );
  }

  // First, check if we have a customer ID stored in profiles
  let profileRows: Array<Pick<ProfileRow, 'stripe_customer_id'>>;
  try {
    profileRows = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
      'select stripe_customer_id from profiles where id = $1 limit 1',
      [user.id],
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to verify Stripe customer');
    throw createError.serviceUnavailable(
      'Billing customer details could not be verified. No checkout was created; please retry.',
    );
  }
  const profile = profileRows[0] ?? null;

  if (isStripeCustomerId(profile?.stripe_customer_id)) {
    stripeCustomerId = profile.stripe_customer_id;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from profile',
    );
  } else if (isStripeCustomerId(existingSubscription?.stripe_customer_id)) {
    stripeCustomerId = existingSubscription.stripe_customer_id;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from subscription',
    );
  } else {
    // No customer ID stored - create a new Stripe customer
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
      stripeCustomerId = customer.id;

      // Store the customer ID in the profile for future use
      try {
        await db.execute('update profiles set stripe_customer_id = $1 where id = $2', [
          stripeCustomerId,
          user.id,
        ]);
      } catch (error) {
        // The current checkout still uses this exact customer and the webhook
        // repairs the profile link. Keep the failure visible in operations;
        // customer creation itself is idempotent for safe immediate retries.
        logger.error(
          { error, userId: user.id, stripeCustomerId },
          'Created Stripe customer but could not persist the profile link',
        );
      }

      logger.info(
        { userId: user.id, customerId: stripeCustomerId },
        'Created new Stripe customer and stored in profile',
      );
    } catch (err) {
      logger.error(
        { error: err, userId: user.id },
        'Failed to create Stripe customer, proceeding without customer ID',
      );
      // Continue without customer ID - Stripe will create one during checkout
    }
  }

  const checkoutMetadata = {
    user_id: user.id,
    plan_tier: plan,
    // Advisory only — the webhook reads the authoritative seat count from the
    // Stripe subscription ITEM quantity, never from metadata. Carried so a
    // support engineer can see what the customer asked for versus what Stripe
    // recorded.
    requested_seats: String(quantity),
    ...(replacesUnlinkedEntitlement
      ? {
          upgrade_from: existingSubscription.plan_tier,
          replace_unlinked_entitlement: 'true',
        }
      : {}),
  };

  // Create Stripe Checkout Session
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
      success_url: `${process.env['NEXT_PUBLIC_APP_URL']}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env['NEXT_PUBLIC_APP_URL']}/pricing`,
      client_reference_id: user.id, // Primary identifier for webhook
      // Metadata duplicates user.id for fast webhook lookups: the webhook handler
      // resolves the Clerk user via metadata first (O(1) map read) before falling
      // back to client_reference_id or a Stripe customer lookup. This is intentional
      // - not redundant - because Stripe customer IDs are not always available at
      // webhook time (e.g. first-time checkout before the customer object is linked).
      metadata: checkoutMetadata,
      // Stripe may deliver customer.subscription.created before
      // checkout.session.completed. Copy ownership and replacement context onto
      // the Subscription so that earlier event cannot reset carried usage.
      subscription_data: {
        metadata: checkoutMetadata,
      },
      allow_promotion_codes: true,
    };
    const checkoutSession = requestIdempotencyKey
      ? await stripe.checkout.sessions.create(checkoutSessionParams, {
          // Plan and quantity are part of the key: a client that reuses one
          // Idempotency-Key while changing the seat count must NOT be replayed
          // the earlier session, or the org pays for seats it did not choose.
          idempotencyKey: `checkout:${user.id}:${plan}:${quantity}:${requestIdempotencyKey}`,
        })
      : await stripe.checkout.sessions.create(checkoutSessionParams);

    if (!checkoutSession.url) {
      throw createError.internal('Failed to generate checkout URL');
    }

    // Audit: a paid-plan purchase was initiated. The checkout URL is a
    // single-use credential-bearing link and is never recorded; the resulting
    // entitlement change is audited separately from the Stripe webhook.
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
    // Handle Stripe-specific errors
    if (error instanceof Stripe.errors.StripeCardError) {
      throw createError.validation(error.message);
    } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      throw createError.validation('Invalid checkout configuration. Please contact support.');
    } else if (error instanceof Stripe.errors.StripeAuthenticationError) {
      throw createError.serviceUnavailable(
        'Payment service temporarily unavailable. Please try again later.',
      );
    } else if (error instanceof Stripe.errors.StripeRateLimitError) {
      throw createError.rateLimit('Too many requests. Please wait a moment and try again.');
    } else if (error instanceof Stripe.errors.StripeConnectionError) {
      throw createError.serviceUnavailable(
        'Unable to connect to payment service. Please try again.',
      );
    }

    // Re-throw other errors to be handled by withErrorHandler
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handleCheckout));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
