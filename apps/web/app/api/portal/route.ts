import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { ProfileRow, SubscriptionRow } from '@/lib/server/neon-types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';

if (!process.env['STRIPE_SECRET_KEY']) {
  logger.warn(
    '[billing] STRIPE_SECRET_KEY is not set. Portal endpoint will return 500 until configured.',
  );
}

const stripe = getStripeClientOrNull();

const PORTAL_SCOPE = { resolveOrganization: false } as const;

function getValidatedOrigin(request: Request): string {
  const allowedOriginsEnv =
    process.env['ALLOWED_ORIGINS'] || process.env['NEXT_PUBLIC_APP_URL'] || '';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000');
  }

  const headerOrigin = request.headers.get('origin')?.toLowerCase();

  if (headerOrigin && allowedOrigins.includes(headerOrigin)) {
    return headerOrigin;
  }

  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`.toLowerCase();

  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  const fallbackOrigin = allowedOrigins[0];

  if (!fallbackOrigin) {
    logger.error(
      { headerOrigin, requestOrigin },
      'No valid origin found and no allowed origins configured',
    );
    throw createError.validation('Invalid origin - no allowed origins configured');
  }

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

/**
 * Same-origin relative paths only.
 *
 * This value is handed to Stripe as the page to send the user back to, so an
 * absolute URL or a protocol-relative `//host` would turn the portal into an
 * open redirect off our own domain.
 */
function resolveReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/pricing';
  if (!value.startsWith('/') || value.startsWith('//')) return '/pricing';
  return value;
}

/**
 * Whether to drop the user straight into the portal's cancellation flow rather
 * than its landing page. Stripe rejects this with an invalid_request_error when
 * the portal configuration has cancellation switched off, which is the only way
 * to learn that from the API, the configuration itself is a dashboard setting.
 */
function resolveFlow(value: unknown): 'cancel' | null {
  return value === 'cancel' ? 'cancel' : null;
}

function isCancellationDisabled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const message = String(record['message'] ?? '');
  return (
    record['type'] === 'StripeInvalidRequestError' &&
    /cancel|flow_data|not enabled|configuration/i.test(message)
  );
}

async function handlePortal(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, PORTAL_SCOPE);
  const body = await request
    .clone()
    .json()
    .then((parsed: { returnPath?: unknown; flow?: unknown }) => parsed)
    .catch(() => ({}) as { returnPath?: unknown; flow?: unknown });
  const returnPath = resolveReturnPath(body?.returnPath);
  const flow = resolveFlow(body?.flow);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'portal');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe) {
    throw createError.serviceUnavailable('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }

  type SubRow = Pick<
    SubscriptionRow,
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'apple_original_transaction_id'
    | 'google_purchase_token'
    | 'current_period_end'
    | 'status'
  >;
  let subRows: SubRow[];
  try {
    subRows = await db.query<SubRow>(
      `select plan_tier, stripe_customer_id, stripe_subscription_id,
              apple_original_transaction_id, google_purchase_token, current_period_end, status
       from subscriptions where user_id = $1 limit 1`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to verify subscription before opening billing portal');
    throw createError.serviceUnavailable(
      'Billing details could not be verified. No billing session was opened; please retry.',
    );
  }
  const subscription = subRows[0] ?? null;
  const ownerPolicy = getSubscriptionBillingOwnerPolicy(subscription);

  if (subscription && !ownerPolicy.canOpenStripePortal) {
    throw createError.conflict(stripeBillingOwnershipMessage(ownerPolicy, 'portal'));
  }

  if (!subscription) {
    try {
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
        // TODO(2026-Q3): Remove email fallback entirely. Track via DEPRECATION_PORTAL_EMAIL_FALLBACK metric.
        const { email: userEmail } = await getClerkAuthUser(request);
        if (!userEmail) {
          throw createError.validation('User has no email address and no customer_id stored');
        }

        logger.warn(
          {
            userId: userId,
            email: userEmail,
            deprecationNotice: 'Email-based Stripe lookup is deprecated and will be removed',
          },
          'SECURITY WARNING: No stripe_customer_id in profile - using email fallback (DEPRECATED)',
        );

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

      if (!customerId) {
        throw createError.internal('No Stripe customer found for this account');
      }
      const origin = getValidatedOrigin(request);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}${returnPath}`,
      });

      logger.info(
        {
          userId: userId,
          customerId: customerId,
          sessionId: session.id,
        },
        'Portal session created (self-healing)',
      );

      await recordAuditEvent({
        userId,
        eventType: 'billing_portal_opened',
        request,
        detail: { resourceType: 'subscription', source: 'self_healing' },
      });

      return NextResponse.json({ url: session.url }, { status: 200 });
    } catch (err) {
      if (isAppError(err)) throw err;
      logger.error({ error: err, userId: userId }, 'Self-healing portal lookup failed');
      throw createError.notFound('No subscription found.');
    }
  }

  const allowedStatuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];

  let stripeCustomerId = subscription.stripe_customer_id;

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
    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${origin}${returnPath}`,
        ...(flow === 'cancel' && subscription.stripe_subscription_id
          ? {
              flow_data: {
                type: 'subscription_cancel' as const,
                subscription_cancel: { subscription: subscription.stripe_subscription_id },
              },
            }
          : {}),
      });
    } catch (error) {
      if (flow !== 'cancel' || !isCancellationDisabled(error)) throw error;
      logger.warn(
        { userId, customerId: stripeCustomerId },
        'Portal configuration has cancellation disabled; cannot deep-link cancel',
      );
      return NextResponse.json(
        {
          error: 'cancellation_unavailable',
          message:
            'Cancellation is not enabled in the billing portal, so we could not take you straight there. Open Manage billing, or contact support and we will cancel it for you.',
        },
        { status: 409 },
      );
    }

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
