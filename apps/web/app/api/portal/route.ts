import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
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
      apiVersion: '2023-10-16',
    })
  : null;

function getOrigin(request: Request) {
  const headerOrigin = request.headers.get('origin');
  if (headerOrigin) return headerOrigin;

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function handlePortal(request: NextRequest) {
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

  if (error || !subscription) {
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

  const origin = getOrigin(request);

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
