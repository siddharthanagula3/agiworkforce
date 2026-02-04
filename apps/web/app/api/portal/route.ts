import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  logger.warn(
    '[billing] STRIPE_SECRET_KEY is not set. Portal endpoint will return 500 until configured.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
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

  // If no valid origin found, use a fallback from the allowed list only
  // SECURITY: Never use NEXT_PUBLIC_APP_URL directly as fallback without validation
  const fallbackOrigin = allowedOrigins[0];

  if (!fallbackOrigin) {
    logger.error(
      { headerOrigin, requestOrigin },
      'No valid origin found and no allowed origins configured',
    );
    throw createError.validation('Invalid origin - no allowed origins configured');
  }

  // Validate fallback is a proper URL with https (or http for localhost)
  try {
    const fallbackUrl = new URL(fallbackOrigin);
    const isLocalhost =
      fallbackUrl.hostname === 'localhost' || fallbackUrl.hostname === '127.0.0.1';
    if (fallbackUrl.protocol !== 'https:' && !isLocalhost) {
      logger.error({ fallbackOrigin }, 'Fallback origin must use HTTPS (except localhost)');
      throw createError.validation('Invalid fallback origin - must use HTTPS');
    }
  } catch (urlError) {
    if (urlError instanceof Error && urlError.message.includes('Invalid')) {
      throw urlError;
    }
    logger.error({ fallbackOrigin, error: urlError }, 'Fallback origin is not a valid URL');
    throw createError.validation('Invalid fallback origin');
  }

  logger.warn(
    {
      headerOrigin,
      requestOrigin,
      allowedOrigins: allowedOrigins.length,
      fallbackOrigin,
    },
    'Origin not in whitelist, using fallback',
  );

  return fallbackOrigin;
}

async function handlePortal(request: NextRequest) {
  // CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Rate limiting: 10 requests per minute per user/IP
  const rateLimitResponse = await withRateLimit(request, 'portal');
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

  // Self-healing: If no local subscription, try to find in Stripe by customer_id (BEST PRACTICE)
  if (!subscription) {
    try {
      // First, check if we have customer_id stored in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();

      let customerId: string | null = profile?.stripe_customer_id || null;

      if (customerId) {
        logger.info(
          { userId: user.id, customerId },
          'Found stripe_customer_id in profiles (BEST PRACTICE)',
        );
      } else {
        // AUDIT-008-015: Email fallback for legacy data only
        // DEPRECATION NOTICE: This fallback will be removed in a future version.
        // All users should have stripe_customer_id stored in profiles table.
        // This is safer for portal access than payment processing, but still risky
        // because email addresses can be changed or associated with multiple accounts.
        if (!user.email) {
          throw createError.validation('User has no email address and no customer_id stored');
        }

        // AUDIT-008-015: Warning log for email fallback usage - track for migration
        logger.warn(
          {
            userId: user.id,
            email: user.email,
            deprecationNotice: 'Email-based Stripe lookup is deprecated and will be removed',
          },
          'SECURITY WARNING: No stripe_customer_id in profile - using email fallback (DEPRECATED)',
        );

        // List customers by email - could return multiple if email was reused
        const customers = await stripe.customers.list({ email: user.email, limit: 10 });

        if (customers.data.length === 0) {
          throw createError.notFound('No subscription or customer found in Stripe');
        }

        // SECURITY: Check if multiple customers exist with this email
        if (customers.data.length > 1) {
          logger.warn(
            { userId: user.id, email: user.email, count: customers.data.length },
            'SECURITY WARNING: Multiple Stripe customers found with same email',
          );

          // Try to find the customer with an active subscription
          const customersWithSubscriptions = await Promise.all(
            customers.data.map(async (cust) => {
              const subs = await stripe.subscriptions.list({
                customer: cust.id,
                limit: 1,
                status: 'active',
              });
              return { customer: cust, hasActiveSub: subs.data.length > 0 };
            }),
          );

          const activeCustomer = customersWithSubscriptions.find((c) => c.hasActiveSub);

          if (!activeCustomer) {
            throw createError.validation(
              'Multiple customers found with this email - cannot determine which to use',
            );
          }

          customerId = activeCustomer.customer.id;
          logger.warn(
            { userId: user.id, customerId, email: user.email },
            'Selected customer with active subscription from multiple matches',
          );
        } else {
          customerId = customers.data[0].id;
        }

        // CRITICAL: Store customer_id for future lookups
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);

        logger.info(
          { userId: user.id, customerId, email: user.email },
          'Stored stripe_customer_id in profile (migration from email fallback)',
        );
      }

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
        'Portal session created (self-healing)',
      );

      return NextResponse.json({ url: session.url }, { status: 200 });
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

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
