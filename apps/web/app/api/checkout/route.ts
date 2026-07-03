// apps/web/app/api/checkout/route.ts
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';

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

// Paid-plan checkout is env-gated while billing controls (metering, refunds,
// fraud, provider terms) are proven. Managed cloud itself is public-alpha-open;
// this gate only governs paid higher-capacity tiers, not cloud access.
// Set STRIPE_CHECKOUT_ENABLED=true in env to open paid-plan checkout.
const CHECKOUT_ENABLED = process.env['STRIPE_CHECKOUT_ENABLED'] === 'true';

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Reject checkout requests when paid-plan checkout is not yet enabled
  // (STRIPE_CHECKOUT_ENABLED). Prevents bypassing the gate via the API directly.
  if (!CHECKOUT_ENABLED) {
    throw createError.validation(
      'Paid-plan checkout is not available yet. Local and BYOK are free; managed cloud is in public alpha.',
    );
  }

  // Rate limiting: 10 checkouts per minute per user
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId } = await (await import('@clerk/nextjs/server')).auth();
  if (!userId) {
    throw createError.unauthorized('Please sign in to continue');
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

  const { plan, billingInterval, currency } = validationResult.data;

  // Lookup Price ID with type safety. 'basic' prices by currency (USD/INR),
  // not by billing interval — every other plan prices by interval.
  let priceId: string | undefined;
  if (plan === 'basic') {
    priceId =
      currency === 'inr' ? STRIPE_PRICE_IDS.basic.monthlyInr : STRIPE_PRICE_IDS.basic.monthlyUsd;
    if (!priceId) {
      throw createError.validation(`No price configured for basic (${currency ?? 'usd'})`);
    }
  } else {
    const planPrices = STRIPE_PRICE_IDS[plan as 'pro' | 'max' | 'team'];
    if (!planPrices) {
      throw createError.validation(`Invalid plan: ${plan}`);
    }
    priceId = planPrices[billingInterval];
    if (!priceId) {
      throw createError.validation(`No price configured for ${plan} ${billingInterval}`);
    }
  }

  // Get or create Stripe customer to prevent duplicate customers
  let stripeCustomerId: string | null = null;
  const stripe = getStripe();

  // If user already has an active subscription, do NOT create a new subscription via Checkout.
  // Route them to the Billing Portal instead to prevent duplicate subscriptions / double billing.
  type SubRow = Pick<
    SubscriptionRow,
    'status' | 'plan_tier' | 'stripe_customer_id' | 'stripe_subscription_id'
  >;
  const subRows = await db
    .query<SubRow>(
      'select status, plan_tier, stripe_customer_id, stripe_subscription_id from subscriptions where user_id = $1 limit 1',
      [user.id],
    )
    .catch(() => [] as SubRow[]);
  const existingSubscription = subRows[0] ?? null;

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const hasActiveSubscription =
    !!existingSubscription &&
    existingSubscription.plan_tier !== 'free' &&
    activeStatuses.has(existingSubscription.status);

  // First, check if we have a customer ID stored in profiles
  const profileRows = await db
    .query<
      Pick<ProfileRow, 'stripe_customer_id'>
    >('select stripe_customer_id from profiles where id = $1 limit 1', [user.id])
    .catch(() => [] as Pick<ProfileRow, 'stripe_customer_id'>[]);
  const profile = profileRows[0] ?? null;

  if (profile?.stripe_customer_id) {
    stripeCustomerId = profile.stripe_customer_id;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from profile',
    );
  } else if (existingSubscription?.stripe_customer_id) {
    stripeCustomerId = existingSubscription.stripe_customer_id;
    logger.info(
      { userId: user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from subscription',
    );
  } else {
    // No customer ID stored - create a new Stripe customer
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Store the customer ID in the profile for future use
      await db
        .execute('update profiles set stripe_customer_id = $1 where id = $2', [
          stripeCustomerId,
          user.id,
        ])
        .catch(() => undefined);

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

  // If the user is already subscribed, open Billing Portal instead of starting a new Checkout.
  if (hasActiveSubscription) {
    try {
      // As a resilience fallback, try to discover the customer by email if still missing.
      if (!stripeCustomerId && user.email) {
        const customers = await stripe.customers.list({ email: user.email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0]?.id ?? null;
          await db
            .execute('update profiles set stripe_customer_id = $1 where id = $2', [
              stripeCustomerId,
              user.id,
            ])
            .catch(() => undefined);
        }
      }

      if (!stripeCustomerId) {
        throw createError.internal('Missing Stripe customer ID for billing portal');
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${process.env['NEXT_PUBLIC_APP_URL']}/pricing`,
      });

      return NextResponse.json({ url: portalSession.url });
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        'Failed to create billing portal session for existing subscriber',
      );
      throw createError.internal('Failed to open billing portal');
    }
  }

  // Create Stripe Checkout Session
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      locale: 'auto', // Auto-detect browser locale to prevent i18n module errors
      customer: stripeCustomerId || undefined, // Use existing customer if available
      customer_email: stripeCustomerId ? undefined : user.email, // Only set if no customer
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env['NEXT_PUBLIC_APP_URL']}/chat`,
      cancel_url: `${process.env['NEXT_PUBLIC_APP_URL']}/pricing`,
      client_reference_id: user.id, // Primary identifier for webhook
      // Metadata duplicates user.id for fast webhook lookups: the webhook handler
      // resolves the Clerk user via metadata first (O(1) map read) before falling
      // back to client_reference_id or a Stripe customer lookup. This is intentional
      // - not redundant - because Stripe customer IDs are not always available at
      // webhook time (e.g. first-time checkout before the customer object is linked).
      metadata: {
        user_id: user.id,
        plan_tier: plan,
      },
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      throw createError.internal('Failed to generate checkout URL');
    }

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

export const POST = withErrorHandler(handleCheckout);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
