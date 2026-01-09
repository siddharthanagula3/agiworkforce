import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

// Lazy initialization to avoid build-time errors when STRIPE_SECRET_KEY is not set
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, {
    apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
  });
}

/**
 * POST /api/credit-topup
 * Create a Stripe Checkout session for purchasing additional credits
 * This is primarily for Max plan users who need more credits
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await withRateLimit(request, 'credit-topup');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const stripe = getStripeClient();
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const amount_cents = (body as { amount_cents?: unknown } | null | undefined)?.amount_cents;

    // Validate amount (default to $100 if not specified)
    const creditAmount =
      typeof amount_cents === 'number' && Number.isFinite(amount_cents) ? amount_cents : 10000; // 10000 cents = $100

    // Validate amount is reasonable ($10 min, $1000 max)
    if (!Number.isInteger(creditAmount) || creditAmount < 1000 || creditAmount > 100000) {
      return NextResponse.json(
        { error: 'Invalid top-up amount. Must be between $10 and $1,000.' },
        { status: 400 },
      );
    }

    // Get user's profile to check for existing Stripe customer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      logger.warn(
        { error: profileError, userId: session.user.id },
        'Failed to fetch profile for top-up',
      );
    }

    let customerId = profile?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: {
          supabase_user_id: session.user.id,
        },
      });
      customerId = customer.id;

      // Update profile with customer ID
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', session.user.id);
      if (updateError) {
        // Non-fatal: proceed with checkout even if we fail to persist mapping
        logger.warn(
          { error: updateError, userId: session.user.id, customerId },
          'Failed to store stripe_customer_id on profile',
        );
      }
    }

    // Get the success and cancel URLs
    const baseUrl =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseUrl) {
      throw new Error('Missing base URL for redirect (set NEXT_PUBLIC_APP_URL)');
    }

    // Basic validation to avoid returning malformed redirect URLs
    try {
      new URL(baseUrl);
    } catch {
      throw new Error('Invalid base URL for redirect');
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
        user_id: session.user.id,
        type: 'credit_topup',
        credit_amount_cents: creditAmount.toString(),
      },
      payment_intent_data: {
        metadata: {
          user_id: session.user.id,
          type: 'credit_topup',
          credit_amount_cents: creditAmount.toString(),
        },
      },
    });

    logger.info(
      {
        userId: session.user.id,
        sessionId: checkoutSession.id,
        amount: creditAmount,
      },
      'Credit top-up checkout session created',
    );

    if (!checkoutSession.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    logger.error({ error }, 'Error creating credit top-up checkout session');
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Failed to create checkout session',
        },
      },
      { status: 500 },
    );
  }
}
