import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow } from '@/lib/server/neon-types';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, isOriginAllowed } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';

// Lazy initialization to avoid build-time errors when STRIPE_SECRET_KEY is not set
function getStripeClient(): Stripe {
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) {
    throw createError.serviceUnavailable('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
  });
}

/**
 * POST /api/credit-topup
 * Create a Stripe Checkout session for managed credits.
 *
 * Managed cloud is public-alpha-open; managed credits/top-ups are env-gated
 * (AGI_MANAGED_CREDITS_PRIVATE_BETA) until metering, fraud, refunds,
 * chargebacks, abuse controls, provider terms, retention, and deletion
 * controls are proven.
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

  const { userId, email } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const amount_cents = (body as { amount_cents?: unknown } | null | undefined)?.amount_cents;

  // Require amount_cents - never silently default to avoid accidental charges
  if (amount_cents === undefined || amount_cents === null) {
    throw createError.validation('amount_cents is required');
  }

  if (typeof amount_cents !== 'number' || !Number.isFinite(amount_cents)) {
    throw createError.validation('amount_cents must be a finite number');
  }

  const creditAmount = amount_cents;

  // Validate amount is reasonable ($10 min, $1000 max)
  if (!Number.isInteger(creditAmount) || creditAmount < 1000 || creditAmount > 100000) {
    throw createError.validation('Invalid top-up amount. Must be between $10 and $1,000.');
  }

  if (!isManagedCreditPrivateBetaEnabled()) {
    throw createError.forbidden(
      'Managed credit top-ups are not currently available. Manage your plan from billing.',
    );
  }

  const stripe = getStripeClient();

  // Get user's profile to check for existing Stripe customer
  const [profileRow] = await db
    .query<
      Pick<ProfileRow, 'stripe_customer_id'>
    >('select stripe_customer_id from profiles where id = $1 limit 1', [userId])
    .catch((profileError: unknown) => {
      // Do NOT swallow: a failed profile lookup must not fall through to creating
      // a brand-new Stripe customer below — that orphans the user's existing
      // customer and causes duplicate customers for the same user. Surface the
      // error so the top-up can be retried against the real profile.
      logger.error({ error: profileError, userId: userId }, 'Failed to fetch profile for top-up');
      throw createError.internal('Failed to load billing profile. Please try again.');
    });

  let customerId = profileRow?.stripe_customer_id;

  // Create or retrieve Stripe customer
  if (!customerId) {
    // email may be undefined for phone/SSO/anonymous auth users
    if (!email) {
      throw createError.validation(
        'An email address is required for billing. Please add an email to your account.',
      );
    }
    const customer = await stripe.customers.create({
      email: email,
      metadata: {
        user_id: userId,
      },
    });
    customerId = customer.id;

    // Update profile with customer ID
    await db
      .execute('update profiles set stripe_customer_id = $1 where id = $2', [customerId, userId])
      .catch((updateError: unknown) => {
        // Non-fatal: proceed with checkout even if we fail to persist mapping
        logger.warn(
          { error: updateError, userId: userId, customerId },
          'Failed to store stripe_customer_id on profile',
        );
      });
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
    baseUrl = process.env['NEXT_PUBLIC_APP_URL'] || process.env['NEXT_PUBLIC_SITE_URL'];
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
  const successUrl = `${baseUrl}/billing?topup=success`;
  const cancelUrl = `${baseUrl}/billing?topup=cancelled`;

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
      user_id: userId,
      type: 'credit_topup',
      credit_amount_cents: creditAmount.toString(),
    },
    payment_intent_data: {
      metadata: {
        user_id: userId,
        type: 'credit_topup',
        credit_amount_cents: creditAmount.toString(),
      },
    },
  });

  logger.info(
    {
      userId: userId,
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

function isManagedCreditPrivateBetaEnabled(): boolean {
  return process.env['AGI_MANAGED_CREDITS_PRIVATE_BETA'] === 'true';
}
