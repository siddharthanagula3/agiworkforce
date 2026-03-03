// apps/web/app/api/checkout/route.ts
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

// Lazy-initialize Stripe client to avoid build-time errors when env vars aren't set
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-02-25.clover',
    });
  }
  return stripeClient;
}

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Rate limiting: 10 checkouts per minute per user
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const supabase = await createSupabaseServerClient();
  // Use getUser() for server-side JWT validation — getSession() reads from
  // the cookie without server verification and must not be trusted for auth.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    throw createError.unauthorized('Please sign in to continue');
  }

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

  // Lookup Price ID with type safety
  const planPrices = STRIPE_PRICE_IDS[plan as keyof typeof STRIPE_PRICE_IDS];
  if (!planPrices) {
    throw createError.validation(`Invalid plan: ${plan}`);
  }

  const priceId = planPrices[billingInterval];
  if (!priceId) {
    throw createError.validation(`No price configured for ${plan} ${billingInterval}`);
  }

  // Get or create Stripe customer to prevent duplicate customers
  let stripeCustomerId: string | null = null;
  const stripe = getStripe();

  // If user already has an active subscription, do NOT create a new subscription via Checkout.
  // Route them to the Billing Portal instead to prevent duplicate subscriptions / double billing.
  const { data: existingSubscription } = await supabase
    .from('subscriptions')
    .select('status, plan_tier, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const hasActiveSubscription =
    !!existingSubscription &&
    existingSubscription.plan_tier !== 'free' &&
    activeStatuses.has(existingSubscription.status);

  // First, check if we have a customer ID stored in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

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
          supabase_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Store the customer ID in the profile for future use
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);

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
          await supabase
            .from('profiles')
            .update({ stripe_customer_id: stripeCustomerId })
            .eq('id', user.id);
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
      success_url: `${process.env['NEXT_PUBLIC_APP_URL']}/dashboard`,
      cancel_url: `${process.env['NEXT_PUBLIC_APP_URL']}/pricing`,
      client_reference_id: user.id, // Primary identifier for webhook
      // Metadata duplicates user.id for fast webhook lookups: the webhook handler
      // resolves the Supabase user via metadata first (O(1) map read) before falling
      // back to client_reference_id or a Stripe customer lookup. This is intentional
      // — not redundant — because Stripe customer IDs are not always available at
      // webhook time (e.g. first-time checkout before the customer object is linked).
      metadata: {
        supabase_user_id: user.id,
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
