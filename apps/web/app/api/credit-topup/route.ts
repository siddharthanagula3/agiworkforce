import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, isOriginAllowed } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

// Lazy initialization to avoid build-time errors when STRIPE_SECRET_KEY is not set
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw createError.serviceUnavailable('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/credit-topup
 * Create a Stripe Checkout session for purchasing additional credits
 * This is primarily for Max plan users who need more credits
 */
async function handleCreditTopup(request: NextRequest) {
  // CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request, 'credit-topup');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const stripe = getStripeClient();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw createError.unauthorized('Please sign in to continue');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const amount_cents = (body as { amount_cents?: unknown } | null | undefined)?.amount_cents;

  // Validate amount (default to $100 if not specified)
  const creditAmount =
    typeof amount_cents === 'number' && Number.isFinite(amount_cents) ? amount_cents : 10000; // 10000 cents = $100

  // Validate amount is reasonable ($10 min, $1000 max)
  if (!Number.isInteger(creditAmount) || creditAmount < 1000 || creditAmount > 100000) {
    throw createError.validation('Invalid top-up amount. Must be between $10 and $1,000.');
  }

  // Get user's profile to check for existing Stripe customer
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    logger.warn({ error: profileError, userId: user.id }, 'Failed to fetch profile for top-up');
  }

  let customerId = profile?.stripe_customer_id;

  // Create or retrieve Stripe customer
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: {
        supabase_user_id: user.id,
      },
    });
    customerId = customer.id;

    // Update profile with customer ID
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
    if (updateError) {
      // Non-fatal: proceed with checkout even if we fail to persist mapping
      logger.warn(
        { error: updateError, userId: user.id, customerId },
        'Failed to store stripe_customer_id on profile',
      );
    }
  }

  // AUDIT-008-005: Validate origin against allowed list to prevent open redirect
  // Get the success and cancel URLs - only use origin if it's in the allowed list
  const requestOrigin = request.headers.get('origin');
  let baseUrl: string | undefined;

  // Only use request origin if it passes our CORS validation
  if (requestOrigin && isOriginAllowed(requestOrigin)) {
    baseUrl = requestOrigin;
  } else {
    // Fall back to configured app URL
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (requestOrigin) {
      logger.warn(
        { origin: requestOrigin },
        'Credit topup: rejected untrusted origin, using configured APP_URL',
      );
    }
  }

  if (!baseUrl) {
    throw createError.internal('Missing base URL for redirect (set NEXT_PUBLIC_APP_URL)');
  }

  // Validate URL format
  try {
    new URL(baseUrl);
  } catch {
    throw createError.internal('Invalid base URL for redirect');
  }
  const successUrl = `${baseUrl}/dashboard/billing?topup=success`;
  const cancelUrl = `${baseUrl}/dashboard/billing?topup=cancelled`;

  // Create Stripe Checkout session for one-time credit purchase
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment', // One-time payment, not subscription
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AI Credits Top-Up`,
            description: `One-time purchase of $${(creditAmount / 100).toFixed(2)} in AI usage credits`,
            metadata: {
              type: 'credit_topup',
            },
          },
          unit_amount: creditAmount, // Amount in cents
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      user_id: user.id,
      type: 'credit_topup',
      credit_amount_cents: creditAmount.toString(),
    },
    payment_intent_data: {
      metadata: {
        user_id: user.id,
        type: 'credit_topup',
        credit_amount_cents: creditAmount.toString(),
      },
    },
  });

  logger.info(
    {
      userId: user.id,
      sessionId: checkoutSession.id,
      amount: creditAmount,
    },
    'Credit top-up checkout session created',
  );

  if (!checkoutSession.url) {
    throw createError.internal('Stripe did not return a checkout URL');
  }

  return NextResponse.json({ url: checkoutSession.url });
}

export const POST = withErrorHandler(handleCreditTopup);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
