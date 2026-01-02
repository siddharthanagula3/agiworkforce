import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  logger.warn(
    '[billing] STRIPE_SECRET_KEY is not set. Portal endpoint will return 500 until configured.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
    })
  : null;

/**
 * Get validated origin for Stripe redirect URL.
 * Only allows origins from the whitelist defined in ALLOWED_ORIGINS env var.
 * Falls back to NEXT_PUBLIC_APP_URL if no valid origin is found.
 */
function getValidatedOrigin(request: Request): string {
  // Parse allowed origins from environment variable
  // Format: comma-separated list, e.g., "https://agiworkforce.com,https://app.agiworkforce.com"
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || '';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);

  // Add localhost for development
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000');
  }

  // Get the origin from the request header
  const headerOrigin = request.headers.get('origin')?.toLowerCase();

  if (headerOrigin && allowedOrigins.includes(headerOrigin)) {
    return headerOrigin;
  }

  // Fallback: Extract origin from request URL and validate
  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`.toLowerCase();

  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // If no valid origin found, use the first allowed origin or a safe default
  const fallbackOrigin = process.env.NEXT_PUBLIC_APP_URL || allowedOrigins[0];
  if (!fallbackOrigin) {
    logger.error('No valid origin found and no fallback configured');
    throw createError.validation('Invalid origin');
  }

  logger.warn(
    {
      headerOrigin,
      requestOrigin,
      allowedOrigins,
      fallbackOrigin,
    },
    'Origin not in whitelist, using fallback',
  );

  return fallbackOrigin;
}

async function handlePortal(request: NextRequest) {
  // Rate limiting: 10 requests per minute per user/IP
  const rateLimitResponse = await withRateLimit(request, 'sync-subscription');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe) {
    throw createError.serviceUnavailable('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('user_id', user.id)
    .single();

  // Self-healing: If no local subscription, try to find in Stripe by email
  if (!subscription) {
    if (!user.email) {
      throw createError.validation('User has no email address');
    }

    try {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;

        // Found customer, allow portal access
        // Ideally we should also trigger a sync here to fix the local state
        // We'll proceed with creating the session using this ID
        const origin = getValidatedOrigin(request);
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/pricing`,
        });

        logger.info(
          {
            userId: user.id,
            customerId: customerId,
            sessionId: session.id,
          },
          'Portal session created via email lookup (self-healing)',
        );

        return NextResponse.json({ url: session.url }, { status: 200 });
      } else {
        throw createError.notFound('No subscription or customer found in Stripe');
      }
    } catch (err) {
      // If catching our own throw or stripe error, rethrow or log
      if (err instanceof Error && err.message.includes('No subscription')) {
        throw err;
      }
      logger.error({ error: err, userId: user.id }, 'Self-healing portal lookup failed');
      throw createError.notFound('No subscription found.');
    }
  }

  if (error) {
    throw createError.notFound('No subscription found.');
  }

  // Allow users to access portal even if canceled, to view invoices etc.
  // The only strict requirement is having a customer ID.
  const allowedStatuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];

  let stripeCustomerId = subscription.stripe_customer_id;

  // If no customer_id but we have subscription_id, try to retrieve it from Stripe
  if (!stripeCustomerId && subscription.stripe_subscription_id && stripe) {
    try {
      logger.info(
        {
          userId: user.id,
          subscriptionId: subscription.stripe_subscription_id,
        },
        'No customer_id found, retrieving from subscription',
      );
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id,
      );
      stripeCustomerId = stripeSubscription.customer as string;

      // Update Supabase with the customer_id for future requests
      if (stripeCustomerId) {
        await supabase
          .from('subscriptions')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('user_id', user.id);
        logger.info(
          {
            userId: user.id,
            customerId: stripeCustomerId,
          },
          'Updated subscription with customer_id',
        );
      }
    } catch (stripeError) {
      logger.error(
        {
          userId: user.id,
          subscriptionId: subscription.stripe_subscription_id,
          error: stripeError,
        },
        'Failed to retrieve customer from Stripe subscription',
      );
    }
  }

  if (!stripeCustomerId) {
    logger.error(
      {
        userId: user.id,
        subscription,
      },
      'Subscription found but no stripe_customer_id',
    );
    throw createError.notFound(
      'No billing account linked to this subscription. Please contact support.',
    );
  }

  // Optional: Warn if status is weird, but usually Portal handles it.
  if (!allowedStatuses.includes(subscription.status)) {
    logger.warn(
      {
        userId: user.id,
        status: subscription.status,
      },
      'Accessing portal with unusual status',
    );
  }

  const origin = getValidatedOrigin(request);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/pricing`,
    });

    logger.info(
      {
        userId: user.id,
        customerId: stripeCustomerId,
        sessionId: session.id,
      },
      'Portal session created',
    );

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
        customerId: stripeCustomerId,
      },
      'Failed to create Stripe portal session',
    );

    if (error instanceof Stripe.errors.StripeError) {
      throw createError.stripe('Failed to create portal session', {
        type: error.type,
        code: error.code,
      });
    }

    throw createError.internal('Failed to create portal session');
  }
}

export const POST = withErrorHandler(handlePortal);
