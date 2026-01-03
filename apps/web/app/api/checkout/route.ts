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

// Lazy-initialize Stripe client to avoid build-time errors when env vars aren't set
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2025-12-15.clover',
    });
  }
  return stripeClient;
}

// Type-safe request body
interface CheckoutRequest {
  plan: string;
  billingInterval: 'monthly' | 'annual';
}

async function handleCheckout(request: NextRequest): Promise<NextResponse> {
  // Rate limiting: 10 checkouts per minute per user
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw createError.unauthorized('Please sign in to continue');
  }

  // Type-safe request body parsing
  let body: CheckoutRequest;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const { plan, billingInterval } = body;

  if (!plan || !billingInterval) {
    throw createError.validation('Missing required fields: plan and billingInterval');
  }

  if (billingInterval !== 'monthly' && billingInterval !== 'annual') {
    throw createError.validation('billingInterval must be either "monthly" or "annual"');
  }

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

  // First, check if we have a customer ID stored in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    stripeCustomerId = profile.stripe_customer_id;
    logger.info(
      { userId: session.user.id, customerId: stripeCustomerId },
      'Using existing Stripe customer from profile',
    );
  } else {
    // No customer ID stored - create a new Stripe customer
    try {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: {
          supabase_user_id: session.user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Store the customer ID in the profile for future use
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', session.user.id);

      logger.info(
        { userId: session.user.id, customerId: stripeCustomerId },
        'Created new Stripe customer and stored in profile',
      );
    } catch (err) {
      logger.error(
        { error: err, userId: session.user.id },
        'Failed to create Stripe customer, proceeding without customer ID',
      );
      // Continue without customer ID - Stripe will create one during checkout
    }
  }

  // Create Stripe Checkout Session
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      locale: 'auto', // Auto-detect browser locale to prevent i18n module errors
      customer: stripeCustomerId || undefined, // Use existing customer if available
      customer_email: stripeCustomerId ? undefined : session.user.email, // Only set if no customer
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      client_reference_id: session.user.id, // Primary identifier for webhook
      metadata: {
        supabase_user_id: session.user.id, // Canonical key for webhook handler
        userId: session.user.id, // Legacy key for backwards compatibility
        plan_tier: plan, // Useful for the webhook
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
