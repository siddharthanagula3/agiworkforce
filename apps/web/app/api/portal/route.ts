import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { recordAuditEvent } from '@/lib/security-audit';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'];

if (!STRIPE_SECRET_KEY) {
  logger.warn(
    '[billing] STRIPE_SECRET_KEY is not set. Portal endpoint will return 500 until configured.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
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
  const allowedOriginsEnv =
    process.env['ALLOWED_ORIGINS'] || process.env['NEXT_PUBLIC_APP_URL'] || '';
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
  const { userId, email: userEmail } = await getClerkAuthUser(request);

  // CSRF protection for state-changing endpoint after authenticating the
  // Desktop bearer/cookie principal.
  const csrfError = await requireCsrfToken(request, userId);
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

  const db = getNeonDb();

  type SubRow = Pick<SubscriptionRow, 'stripe_customer_id' | 'stripe_subscription_id' | 'status'>;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      'select stripe_customer_id, stripe_subscription_id, status from subscriptions where user_id = $1 limit 1',
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to verify subscription before opening billing portal');
    throw createError.serviceUnavailable(
      'Billing details could not be verified. No billing session was opened; please retry.',
    );
  }
  const subscription = subRows[0] ?? null;

  // Self-healing: If no local subscription, try to find in Stripe by customer_id (BEST PRACTICE)
  if (!subscription) {
    try {
      // First, check if we have customer_id stored in profiles
      let profileRows: Array<Pick<ProfileRow, 'stripe_customer_id'>>;
      try {
        profileRows = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
          'select stripe_customer_id from profiles where id = $1 limit 1',
          [userId],
        );
      } catch (error) {
        logger.error({ error, userId }, 'Failed to verify billing customer before portal lookup');
        throw createError.serviceUnavailable(
          'Billing customer details could not be verified. No billing session was opened; please retry.',
        );
      }
      const profileData = profileRows[0] ?? null;

      let customerId: string | null = profileData?.stripe_customer_id || null;

      if (customerId) {
        logger.info(
          { userId: userId, customerId },
          'Found stripe_customer_id in profiles (BEST PRACTICE)',
        );
      } else {
        // AUDIT-008-015: Email fallback for legacy data only
        // DEPRECATION NOTICE: This fallback will be removed in a future version.
        // All users should have stripe_customer_id stored in profiles table.
        // This is safer for portal access than payment processing, but still risky
        // because email addresses can be changed or associated with multiple accounts.
        // TODO(2026-Q3): Remove email fallback entirely. Track via DEPRECATION_PORTAL_EMAIL_FALLBACK metric.
        if (!userEmail) {
          throw createError.validation('User has no email address and no customer_id stored');
        }

        // AUDIT-008-015: Warning log for email fallback usage - track for migration
        logger.warn(
          {
            userId: userId,
            email: userEmail,
            deprecationNotice: 'Email-based Stripe lookup is deprecated and will be removed',
          },
          'SECURITY WARNING: No stripe_customer_id in profile - using email fallback (DEPRECATED)',
        );

        // List customers by email - could return multiple if email was reused
        const customers = await stripe.customers.list({ email: userEmail, limit: 10 });

        if (customers.data.length === 0) {
          throw createError.notFound('No subscription or customer found in Stripe');
        }

        if (customers.data.length > 1) {
          logger.warn(
            { userId: userId, email: userEmail, count: customers.data.length },
            'SECURITY WARNING: Multiple Stripe customers found with same email',
          );
        }

        // BIZ-015: ownership must be PROVEN, not merely "not contradicted".
        // A customer matched by email alone is not evidence of ownership -
        // an account whose email previously belonged to someone else, or a
        // legacy customer carrying no `user_id` metadata, would otherwise
        // hand this caller a portal session over a stranger's billing
        // record: their invoices, their card, their cancel button. The only
        // acceptable match is a customer whose metadata names this user,
        // which every customer created by `/api/checkout` carries. This
        // mirrors the tightened check in `SubscriptionService.syncWithStripe`
        // and deliberately refuses metadata-less legacy customers until an
        // operator backfills `metadata.user_id`.
        const ownedCustomer =
          customers.data.find((customer) => customer.metadata?.['user_id'] === userId) ?? null;

        if (!ownedCustomer) {
          logger.error(
            {
              userId,
              email: userEmail,
              candidateCount: customers.data.length,
            },
            'IDOR blocked: Stripe customer email matched but ownership could not be verified',
          );
          return NextResponse.json(
            { error: 'Customer account mismatch. Please contact support.' },
            { status: 403 },
          );
        }

        customerId = ownedCustomer.id;

        // CRITICAL: Store customer_id for future lookups
        try {
          await db.execute('update profiles set stripe_customer_id = $1 where id = $2', [
            customerId,
            userId,
          ]);
        } catch (error) {
          logger.error(
            { error, userId, customerId },
            'Failed to persist recovered Stripe customer before opening portal',
          );
          throw createError.serviceUnavailable(
            'The recovered billing account could not be linked safely. No billing session was opened; please retry.',
          );
        }

        logger.info(
          { userId: userId, customerId, email: userEmail },
          'Stored stripe_customer_id in profile (migration from email fallback)',
        );
      }

      // Found customer, allow portal access
      // Ideally we should also trigger a sync here to fix the local state
      // We'll proceed with creating the session using this ID
      if (!customerId) {
        throw createError.internal('No Stripe customer found for this account');
      }
      const origin = getValidatedOrigin(request);
      // SEATS: whether this portal lets a customer edit the subscription
      // quantity is decided by the Stripe Dashboard portal configuration, not
      // here — no `configuration` is pinned, so this route cannot enable or
      // disable it. Any seat change made there reaches us only as
      // `customer.subscription.updated`, where the webhook reads the
      // authoritative quantity via `resolveSubscriptionSeats`. Do NOT add
      // `flow_data`/`configuration` without a configured portal-configuration
      // id; guessing one would fail every portal request.
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/pricing`,
      });

      logger.info(
        {
          userId: userId,
          customerId: customerId,
          sessionId: session.id,
        },
        'Portal session created (self-healing)',
      );

      // Audit: the caller opened Stripe's billing management surface, where
      // plan and payment-method changes happen outside our own routes. The
      // portal URL is a single-use credential and is never recorded.
      await recordAuditEvent({
        userId,
        eventType: 'billing_portal_opened',
        request,
        detail: { resourceType: 'subscription', source: 'self_healing' },
      });

      return NextResponse.json({ url: session.url }, { status: 200 });
    } catch (err) {
      // Preserve deliberate auth/validation/availability responses from the
      // recovery path; only collapse unknown Stripe lookup failures.
      if (isAppError(err)) throw err;
      logger.error({ error: err, userId: userId }, 'Self-healing portal lookup failed');
      throw createError.notFound('No subscription found.');
    }
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
          userId: userId,
          subscriptionId: subscription.stripe_subscription_id,
        },
        'No customer_id found, retrieving from subscription',
      );
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id,
      );
      stripeCustomerId = stripeSubscription.customer as string;

      // Update db with the customer_id for future requests
      if (stripeCustomerId) {
        await db
          .execute('update subscriptions set stripe_customer_id = $1 where user_id = $2', [
            stripeCustomerId,
            userId,
          ])
          .catch(() => undefined);
        logger.info(
          {
            userId: userId,
            customerId: stripeCustomerId,
          },
          'Updated subscription with customer_id',
        );
      }
    } catch (stripeError) {
      logger.error(
        {
          userId: userId,
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
        userId: userId,
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
        userId: userId,
        status: subscription.status,
      },
      'Accessing portal with unusual status',
    );
  }

  const origin = getValidatedOrigin(request);

  try {
    // See the seat note on the self-healing session above: seat/quantity edits
    // made in Stripe's hosted portal arrive as `customer.subscription.updated`
    // and are read from the subscription item, never from metadata.
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/pricing`,
    });

    logger.info(
      {
        userId: userId,
        customerId: stripeCustomerId,
        sessionId: session.id,
      },
      'Portal session created',
    );

    await recordAuditEvent({
      userId,
      eventType: 'billing_portal_opened',
      request,
      detail: { resourceType: 'subscription', source: 'billing_portal' },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
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

export const POST = withCorsRoute(withErrorHandler(handlePortal));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
