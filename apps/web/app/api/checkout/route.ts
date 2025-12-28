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
import { SubscriptionService } from '@/lib/services/subscription-service';
import { validateCsrfFromRequest } from '@/lib/csrf';

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

  // CSRF protection
  const csrfValid = await validateCsrfFromRequest(request);
  if (!csrfValid) {
    throw createError.unauthorized('Invalid or missing CSRF token');
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
    // Prevent duplicate subscriptions for the same plan when one is already active.
    // This uses the shared SubscriptionService so behavior is consistent with webhooks
    // and the sync-subscription endpoint.
    let existingSub = null;
    try {
      existingSub = await SubscriptionService.getSubscription(user.id);
    } catch (err) {
      // If the lookup fails for any reason, log and continue; we don't want
      // checkout to break because of a non-critical read.
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId: user.id,
        },
        'Failed to fetch existing subscription before checkout',
      );
    }

    const activeStatuses = ['active', 'trialing', 'past_due'];
    if (
      existingSub &&
      activeStatuses.includes(existingSub.status) &&
      existingSub.plan_tier === plan
    ) {
      // User already has this plan. Instead of creating a new subscription,
      // send them to the billing portal so they can manage or upgrade.
      let customerId: string | undefined;

      if (existingSub.stripe_subscription_id) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id);
          customerId = stripeSub.customer as string;
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
              userId: user.id,
              subscriptionId: existingSub.stripe_subscription_id,
            },
            'Failed to retrieve Stripe subscription while preventing duplicate checkout',
          );
        }
      }

      // Fallback: try by email if we still don't have a customer ID
      if (!customerId && user.email) {
        try {
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
          }
        } catch (err) {
          logger.error(
            {
              error: err instanceof Error ? err.message : String(err),
              userId: user.id,
            },
            'Failed to look up Stripe customer while preventing duplicate checkout',
          );
        }
      }

      if (customerId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/pricing`,
        });

        logger.info(
          {
            userId: user.id,
            customerId,
            existingPlan: existingSub.plan_tier,
            subscriptionId: existingSub.stripe_subscription_id,
          },
          'Redirecting to billing portal instead of creating duplicate subscription',
        );

        return NextResponse.json(
          {
            alreadySubscribed: true,
            url: portalSession.url,
          },
          { status: 200 },
        );
      }

      // If we couldn't determine a customer ID for some reason, fall through and
      // let normal checkout proceed rather than hard-failing.
      logger.warn(
        {
          userId: user.id,
          existingPlan: existingSub.plan_tier,
        },
        'Existing subscription detected but could not determine Stripe customer; proceeding with checkout',
      );
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        plan_tier: plan,
        supabase_user_id: user.id,
      },
    };

    let customerId: string | undefined;

    if (user.email) {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        plan_tier: plan,
        billing_interval: billingInterval,
      },
    };

    if (customerId) {
      sessionParams.customer = customerId;
      // When providing an existing customer, updating the email is optional but good practice if needed.
      // However, Checkout uses the existing customer.
      sessionParams.customer_update = {
        address: 'auto',
      };
    } else {
      sessionParams.customer_email = user.email ?? undefined;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
