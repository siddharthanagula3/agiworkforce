import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { CheckoutRequestSchema } from '@/lib/validations/checkout';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  logger.error(
    '[billing] STRIPE_SECRET_KEY is not set in Vercel environment variables. Checkout endpoint will fail. Please configure STRIPE_SECRET_KEY in Vercel project settings.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
    })
  : null;

function getOrigin(request: Request) {
  const headerOrigin = request.headers.get('origin');
  if (headerOrigin) return headerOrigin;

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getPriceIdForPlan(
  plan: 'hobby' | 'free' | 'pro' | 'max' | 'enterprise',
  billingInterval: 'monthly' | 'annual',
): string | null {
  if (plan === 'enterprise' || plan === 'free') {
    return null;
  }

  const planPrices = STRIPE_PRICE_IDS[plan];
  if (planPrices) {
    return planPrices[billingInterval] ?? null;
  }

  return null;
}

async function handleCheckout(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe) {
    throw createError.serviceUnavailable('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = CheckoutRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { plan, billingInterval } = validationResult.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  if (plan === 'enterprise') {
    throw createError.validation(
      'Enterprise plans require custom pricing. Please contact sales for more information.',
    );
  }

  const priceId = getPriceIdForPlan(plan, billingInterval);
  if (!priceId) {
    throw createError.validation('Unsupported plan or billing interval');
  }

  const origin = getOrigin(request);

  try {
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        plan_tier: plan,
        supabase_user_id: user.id,
      },
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: subscriptionData,
      allow_promotion_codes: plan === 'hobby',
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        plan_tier: plan,
        billing_interval: billingInterval,
      },
    });

    logger.info(
      {
        userId: user.id,
        plan,
        billingInterval,
        sessionId: session.id,
      },
      'Checkout session created',
    );

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
        plan,
        billingInterval,
      },
      'Failed to create Stripe checkout session',
    );

    if (error instanceof Stripe.errors.StripeError) {
      throw createError.stripe('Failed to create checkout session', {
        type: error.type,
        code: error.code,
      });
    }

    throw createError.internal('Failed to create checkout session');
  }
}

export const POST = withErrorHandler(handleCheckout);
