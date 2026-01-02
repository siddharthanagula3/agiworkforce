// apps/web/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';

import { requireEnv } from '@/utils/env';

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

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan, billingInterval } = await req.json();

    if (!plan || !billingInterval) {
      return NextResponse.json({ error: 'Missing plan or billingInterval' }, { status: 400 });
    }

    // Lookup Price ID
    const planPrices = STRIPE_PRICE_IDS[plan as keyof typeof STRIPE_PRICE_IDS];
    const priceId = planPrices ? planPrices[billingInterval as 'monthly' | 'annual'] : null;

    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan configuration' }, { status: 400 });
    }

    // Create Stripe Checkout Session
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      locale: 'en', // Explicitly set locale to prevent i18n loading issues
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      client_reference_id: session.user.id, // Primary identifier for webhook
      metadata: {
        supabase_user_id: session.user.id, // Canonical key for webhook handler
        userId: session.user.id, // Legacy key for backwards compatibility
        plan_tier: plan, // Useful for the webhook
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Checkout error:', error);

    // Sanitize error messages to prevent exposing internal details
    // Only return safe, user-friendly error messages
    let safeMessage = 'An error occurred during checkout. Please try again.';
    let statusCode = 500;

    if (error instanceof Stripe.errors.StripeCardError) {
      // Card errors are safe to show to users
      safeMessage = error.message;
      statusCode = 400;
    } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      // Invalid request - likely a configuration issue, keep generic
      safeMessage = 'Invalid checkout configuration. Please contact support.';
      statusCode = 400;
    } else if (error instanceof Stripe.errors.StripeAuthenticationError) {
      // Auth errors should not expose details
      safeMessage = 'Payment service temporarily unavailable. Please try again later.';
      statusCode = 503;
    } else if (error instanceof Stripe.errors.StripeRateLimitError) {
      safeMessage = 'Too many requests. Please wait a moment and try again.';
      statusCode = 429;
    } else if (error instanceof Stripe.errors.StripeConnectionError) {
      safeMessage = 'Unable to connect to payment service. Please try again.';
      statusCode = 503;
    }
    // For all other errors (including generic Error instances), use the default safe message
    // Never expose raw error.message as it may contain stack traces or internal info

    return NextResponse.json({ error: safeMessage }, { status: statusCode });
  }
}
