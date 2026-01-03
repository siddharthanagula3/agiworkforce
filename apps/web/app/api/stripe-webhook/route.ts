import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { PRICING_CONFIG } from '@/lib/pricing';
import { resolvePlanTier, isValidPlanTier } from '@/lib/price-tier-mapping';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  logger.error(
    'Stripe webhook is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel environment variables.',
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error(
    'Supabase service role environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables. Webhook cannot update subscriptions.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
    })
  : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const { getPlanFromPriceId } = PRICING_CONFIG;

/**
 * Ensure a profile exists for the user (required for subscriptions FK constraint)
 */
async function ensureProfileExists(userId: string, email?: string | null): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not initialized');
  }

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    logger.error({ error: fetchError, userId }, 'Error checking for existing profile');
    throw fetchError;
  }

  if (!existingProfile) {
    // Profile doesn't exist - create it
    logger.info({ userId, email }, 'Creating missing profile for user in webhook');
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, email: email || null } as Record<string, unknown>);

    if (insertError) {
      // Ignore duplicate key errors (profile might have been created concurrently)
      if (insertError.code !== '23505') {
        logger.error({ error: insertError, userId }, 'Failed to create profile');
        throw insertError;
      }
      logger.info({ userId }, 'Profile already exists (concurrent creation)');
    } else {
      logger.info({ userId, email }, 'Profile created successfully in webhook');
    }
  }
}

async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin || !stripe) {
    logger.error('upsertSubscriptionFromSession: missing dependencies');
    throw new Error('Missing dependencies');
  }

  logger.info({ sessionId: session.id }, 'Processing checkout session');

  let supabaseUserId =
    session.metadata?.['supabase_user_id'] ||
    session.metadata?.['userId'] ||
    session.client_reference_id;

  // If no user ID in metadata, try to find user by customer email
  // WARNING: Email-based lookup is a fallback and requires extra verification
  if (!supabaseUserId && session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer as string);
      if (typeof customer !== 'string' && !customer.deleted && customer.email) {
        // Query subscriptions table to find user with this email instead of listing all users
        const { data: subscriptions, error: subError } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('email', customer.email)
          .limit(1)
          .single();

        if (!subError && subscriptions?.user_id) {
          supabaseUserId = subscriptions.user_id;
          logger.info(
            { sessionId: session.id, email: customer.email, userId: supabaseUserId },
            'Resolved user_id from customer email via subscriptions table',
          );
        } else {
          // No existing subscription found - this might be a new customer
          logger.warn(
            { sessionId: session.id, email: customer.email },
            'No existing subscription found for customer email - user ID cannot be resolved',
          );
        }
      }
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Failed to resolve user from customer');
    }
  }

  if (!supabaseUserId) {
    logger.error(
      {
        sessionId: session.id,
        customerId: session.customer,
        hasMetadata: !!session.metadata,
        hasClientRef: !!session.client_reference_id,
      },
      'CRITICAL: No supabase_user_id found - cannot create subscription',
    );
    throw new Error('Cannot determine user_id for subscription');
  }

  // Get customer email for profile creation
  let customerEmail: string | null = null;
  if (session.customer && stripe) {
    try {
      const customer = await stripe.customers.retrieve(session.customer as string);
      if (typeof customer !== 'string' && !customer.deleted) {
        customerEmail = customer.email || null;
      }
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Could not fetch customer email');
    }
  }

  // Ensure profile exists before creating subscription (FK constraint)
  await ensureProfileExists(supabaseUserId, customerEmail);

  // Warn about email mismatches (common issue causing subscription assignment problems)
  if (customerEmail) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', supabaseUserId)
      .single();

    if (profile?.email && profile.email !== customerEmail) {
      logger.warn(
        {
          supabaseUserId,
          profileEmail: profile.email,
          stripeCustomerEmail: customerEmail,
          sessionId: session.id,
        },
        'WARNING: Stripe customer email does not match Supabase profile email - subscription will be created for the logged-in user but emails differ',
      );
    }
  }

  // Get plan_tier from metadata or price ID using strict mapping
  const priceId = session.line_items?.data?.[0]?.price?.id;
  const planTier = resolvePlanTier(session.metadata as Record<string, string> | null, priceId);

  if (!planTier || !isValidPlanTier(planTier)) {
    logger.error(
      {
        sessionId: session.id,
        priceId,
        hasMetadata: !!session.metadata?.plan_tier,
        inferredFromPrice: priceId ? 'attempted' : 'no-price-id',
      },
      'CRITICAL: Cannot determine valid plan_tier for subscription',
    );
    throw new Error(`Cannot determine valid plan_tier for subscription (price: ${priceId})`);
  }
  const stripeCustomerId = session.customer as string | null;
  const stripeSubId = session.subscription as string | null;

  logger.debug(
    {
      sessionId: session.id,
      supabaseUserId,
      planTier,
      stripeCustomerId,
      stripeSubId,
    },
    'Session details',
  );

  let stripePriceId: string | null = null;
  if (session.line_items?.data && session.line_items.data.length > 0) {
    stripePriceId = session.line_items.data[0].price?.id || null;
  } else if (stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      if (expandedSession.line_items?.data && expandedSession.line_items.data.length > 0) {
        stripePriceId = expandedSession.line_items.data[0].price?.id || null;
      }
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Failed to retrieve expanded session');
    }
  }

  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;
  let status: string = 'active';
  let cancelAtPeriodEnd: boolean = false;
  let canceledAt: Date | null = null;

  let stripeCouponId: string | null = null;

  if (stripeSubId && stripe) {
    try {
      const subscriptionResponse = await stripe.subscriptions.retrieve(stripeSubId);
      const subscription = subscriptionResponse as unknown as Stripe.Subscription;
      status = subscription.status;
      currentPeriodStart = new Date(
        (subscription as unknown as { current_period_start: number }).current_period_start * 1000,
      );
      currentPeriodEnd = new Date(
        (subscription as unknown as { current_period_end: number }).current_period_end * 1000,
      );
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

      // Ensure we always get price_id from subscription if not already set
      if (!stripePriceId && subscription.items.data.length > 0) {
        stripePriceId = subscription.items.data[0].price.id;
        logger.info(
          { priceId: stripePriceId, subscriptionId: stripeSubId },
          'Retrieved price_id from subscription',
        );
      }

      // Check discounts array (v20 API change: discount -> discounts)
      const discounts = (
        subscription as unknown as { discounts?: Array<{ coupon?: { id?: string } }> }
      ).discounts;
      if (discounts && discounts.length > 0 && discounts[0]?.coupon?.id) {
        stripeCouponId = discounts[0].coupon.id;
      }
    } catch (error) {
      logger.error(
        { error, subscriptionId: stripeSubId },
        'Failed to retrieve subscription details',
      );
    }
  }

  // Final fallback: if we still don't have price_id but have subscription_id, try one more time
  if (!stripePriceId && stripeSubId && stripe) {
    try {
      logger.warn(
        { subscriptionId: stripeSubId },
        'stripe_price_id still null after initial attempts, retrying for subscription',
      );
      const subscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price'],
      });
      if (subscription.items.data.length > 0) {
        stripePriceId = subscription.items.data[0].price.id;
        logger.info(
          { priceId: stripePriceId, subscriptionId: stripeSubId },
          'Successfully retrieved price_id from subscription on retry',
        );
      }
    } catch (error) {
      logger.error({ error, subscriptionId: stripeSubId }, 'Failed to retrieve price_id on retry');
    }
  }

  // Log warning if price_id is still missing and attempt one final retrieval
  if (!stripePriceId && stripeSubId && stripe) {
    logger.warn(
      { sessionId: session.id, subscriptionId: stripeSubId, userId: supabaseUserId },
      'stripe_price_id is null for session. Attempting final retrieval...',
    );
    try {
      // Final attempt: retrieve subscription with full expansion
      const finalSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ['items.data.price', 'items.data.plan'],
      });
      if (finalSubscription.items.data.length > 0) {
        stripePriceId =
          finalSubscription.items.data[0].price?.id ||
          finalSubscription.items.data[0].plan?.id ||
          null;
        if (stripePriceId) {
          logger.info(
            { priceId: stripePriceId },
            'Successfully retrieved price_id in final attempt',
          );
        }
      }
    } catch (error) {
      logger.error(
        { error, subscriptionId: stripeSubId },
        'Final attempt to retrieve price_id failed',
      );
    }
  }

  if (!stripePriceId) {
    logger.error(
      { sessionId: session.id, subscriptionId: stripeSubId, userId: supabaseUserId },
      'CRITICAL: stripe_price_id is still null after all attempts',
    );
  }

  if (!stripeCouponId && stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['total_details.breakdown'],
      });

      if (expandedSession.total_details?.breakdown?.discounts) {
        const discountItem = expandedSession.total_details.breakdown.discounts[0];
        // Access coupon ID through the discount object
        const couponId = (discountItem as unknown as { discount?: { coupon?: { id?: string } } })
          ?.discount?.coupon?.id;
        if (couponId) {
          stripeCouponId = couponId;
        }
      }
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Failed to retrieve session discount details');
    }
  }

  const subData = {
    user_id: supabaseUserId,
    status: status,
    plan_tier: planTier,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubId,
    stripe_price_id: stripePriceId,
    stripe_coupon_id: stripeCouponId,
    current_period_start: currentPeriodStart?.toISOString() || null,
    current_period_end: currentPeriodEnd?.toISOString() || null,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt?.toISOString() || null,
  };

  logger.info({ subscriptionData: subData }, 'Upserting subscription');

  const { error, data } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subData, {
      onConflict: 'user_id',
    })
    .select()
    .single();

  if (error) {
    logger.error(
      {
        error,
        subscriptionData: subData,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
        errorMessage: error.message,
      },
      'CRITICAL: Failed to upsert subscription - subscription will not be created',
    );
    throw error;
  }

  // Allocate credits for the subscription period with retry
  if (data && currentPeriodStart && currentPeriodEnd) {
    const maxRetries = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await SubscriptionService.allocateCreditsForPeriod(
          supabaseUserId,
          data.id,
          planTier,
          new Date(currentPeriodStart),
          new Date(currentPeriodEnd),
        );
        logger.info(
          {
            userId: supabaseUserId,
            subscriptionId: data.id,
            planTier,
            attempt,
          },
          'Credits allocated for new subscription',
        );
        lastError = null;
        break; // Success, exit loop
      } catch (creditError) {
        lastError = creditError;
        logger.warn(
          {
            error: creditError,
            userId: supabaseUserId,
            subscriptionId: data.id,
            attempt,
            maxRetries,
          },
          `Credit allocation attempt ${attempt}/${maxRetries} failed`,
        );

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
      }
    }

    if (lastError) {
      // All retries failed - log critical error but don't fail webhook
      // The sync-subscription endpoint can recover credits later
      logger.error(
        {
          error: lastError,
          userId: supabaseUserId,
          subscriptionId: data.id,
          planTier,
        },
        'CRITICAL: Failed to allocate credits after all retries - user may need manual sync',
      );
    }
  }
}

async function updateSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  if (!supabaseAdmin || !stripe) {
    logger.error('updateSubscriptionFromStripeSubscription: missing dependencies');
    throw new Error('Missing dependencies');
  }

  logger.info({ subscriptionId: subscription.id }, 'Processing subscription update');

  const stripeSubId = subscription.id;
  const stripeCustomerId = subscription.customer as string | null;

  let stripePriceId: string | null = null;
  if (subscription.items.data.length > 0) {
    stripePriceId = subscription.items.data[0].price.id;
  }

  const planTier =
    subscription.metadata?.plan_tier ??
    (stripePriceId ? getPlanFromPriceId(stripePriceId) : null) ??
    'pro';
  if (!subscription.metadata?.plan_tier) {
    logger.warn(
      {
        subscriptionId: subscription.id,
        inferredPlan: planTier,
      },
      'plan_tier missing from subscription metadata. Inferred from price_id.',
    );
  }

  // Extract period timestamps (Stripe SDK v20 type changes)
  const periodStart = (subscription as unknown as { current_period_start: number })
    .current_period_start;
  const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;

  // Get coupon ID from discounts array (v20 API change: discount -> discounts)
  const discounts = (subscription as unknown as { discounts?: Array<{ coupon?: { id?: string } }> })
    .discounts;
  const stripeCouponId =
    discounts && discounts.length > 0 ? discounts[0]?.coupon?.id || null : null;

  // Force update plan tier if we found one
  const updateData: {
    status: string;
    stripe_price_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    stripe_coupon_id?: string | null;
    plan_tier?: string; // Always include plan_tier to fix "Free" issue
  } = {
    status: subscription.status,
    stripe_price_id: stripePriceId,
    current_period_start: new Date(periodStart * 1000).toISOString(),
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_coupon_id: stripeCouponId,
    plan_tier: planTier,
  };

  logger.info({ stripeSubId, stripeCustomerId, updateData }, 'Updating subscription');

  let error;
  let supabaseUserId: string | null = null;

  if (stripeSubId) {
    const { data: existingSub, error: fetchError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();

    if (fetchError) {
      logger.error({ error: fetchError, stripeSubId }, 'Failed to check existing subscription');
    }

    if (existingSub) {
      // Normal path: update by stripe_subscription_id
      supabaseUserId = existingSub.user_id;

      // Fetch current subscription to check period
      const { data: currentSub } = await supabaseAdmin
        .from('subscriptions')
        .select('current_period_start')
        .eq('stripe_subscription_id', stripeSubId)
        .single();

      // Check if this is a new billing period (period_start changed)
      const isNewPeriod = currentSub?.current_period_start !== updateData.current_period_start;

      const res = await supabaseAdmin
        .from('subscriptions')
        .update(updateData)
        .eq('stripe_subscription_id', stripeSubId)
        .select()
        .single();
      error = res.error;

      // Allocate or reset credits if subscription updated successfully
      if (
        !error &&
        res.data &&
        updateData.current_period_start &&
        updateData.current_period_end &&
        supabaseUserId
      ) {
        const periodStart = updateData.current_period_start;
        const periodEnd = updateData.current_period_end;
        try {
          if (isNewPeriod) {
            // New billing period - reset credits
            await SubscriptionService.resetCreditsForNewPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits reset for new billing period',
            );
          } else {
            // Same period - ensure credits are allocated
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits allocated for subscription update',
            );
          }
        } catch (creditError) {
          // Log but don't fail the webhook if credit allocation fails
          logger.error(
            {
              error: creditError,
              userId: supabaseUserId,
              subscriptionId: res.data.id,
            },
            'Failed to allocate/reset credits for subscription',
          );
        }
      }
    } else {
      // Subscription doesn't exist - try to find user and create it
      // First, try metadata
      const metadataUserId = subscription.metadata?.supabase_user_id;
      if (metadataUserId) {
        logger.info(
          { stripeSubId, metadataUserId },
          'Subscription not found. Creating via metadata user_id',
        );
        supabaseUserId = metadataUserId;
      } else if (stripeCustomerId) {
        // Fallback: Try to find user by customer email
        try {
          const customer = await stripe.customers.retrieve(stripeCustomerId);
          if (typeof customer !== 'string' && !customer.deleted && customer.email) {
            const customerEmail = customer.email;
            logger.info({ customerEmail }, 'Attempting to find user by customer email');
            // Query subscriptions table instead of listing all auth users
            const { data: subscriptions, error: subError } = await supabaseAdmin
              .from('subscriptions')
              .select('user_id')
              .eq('email', customerEmail)
              .limit(1)
              .single();

            if (!subError && subscriptions?.user_id) {
              logger.info(
                { userId: subscriptions.user_id, email: customerEmail },
                'Found user by email in subscriptions table',
              );
              supabaseUserId = subscriptions.user_id;
            } else {
              logger.warn(
                { email: customerEmail },
                'No existing subscription found for customer email - cannot create new subscription without user ID',
              );
            }
          } else {
            logger.warn({ stripeCustomerId }, 'Customer has no email address');
          }
        } catch (customerError) {
          logger.error({ error: customerError }, 'Failed to retrieve customer');
        }
      }

      if (supabaseUserId) {
        // Ensure profile exists before creating subscription (FK constraint)
        let customerEmailForProfile: string | null = null;
        if (stripeCustomerId) {
          try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (typeof customer !== 'string' && !customer.deleted) {
              customerEmailForProfile = customer.email || null;
            }
          } catch {
            // Ignore - we'll create profile without email
          }
        }
        await ensureProfileExists(supabaseUserId, customerEmailForProfile);

        // Create new subscription
        const createData = {
          user_id: supabaseUserId,
          ...updateData,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: stripeCustomerId,
        };
        logger.info({ createData }, 'Creating new subscription');
        const res = await supabaseAdmin
          .from('subscriptions')
          .upsert(createData, {
            onConflict: 'user_id',
          })
          .select()
          .single();
        error = res.error;

        // Allocate credits for new subscription
        if (
          !error &&
          res.data &&
          updateData.current_period_start &&
          updateData.current_period_end &&
          supabaseUserId
        ) {
          const periodStart = updateData.current_period_start;
          const periodEnd = updateData.current_period_end;
          try {
            await SubscriptionService.allocateCreditsForPeriod(
              supabaseUserId,
              res.data.id,
              planTier,
              new Date(periodStart),
              new Date(periodEnd),
            );
            logger.info(
              {
                userId: supabaseUserId,
                subscriptionId: res.data.id,
                planTier,
              },
              'Credits allocated for new subscription',
            );
          } catch (creditError) {
            logger.error(
              {
                error: creditError,
                userId: supabaseUserId,
                subscriptionId: res.data.id,
              },
              'Failed to allocate credits for new subscription',
            );
          }
        }
      } else {
        // Last resort: try to update by customer ID (might work if subscription exists)
        logger.warn(
          { stripeSubId },
          'Subscription not found and cannot determine user_id. Attempting customer ID update.',
        );
        const res = await supabaseAdmin
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_customer_id', stripeCustomerId);
        error = res.error;
        if (error) {
          logger.error(
            { error, stripeSubId },
            'Cannot create or update subscription: No user_id found and customer ID update failed.',
          );
        }
      }
    }
  } else if (stripeCustomerId) {
    const res = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);
    error = res.error;
  }

  if (error) {
    logger.error({ error }, 'Failed to update subscription');
    throw error;
  }
}

export async function POST(request: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin not configured');
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.error('Missing Stripe signature');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    logger.info({ eventType: event.type, eventId: event.id }, 'Webhook verified');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Stripe webhook signature verification failed',
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { count } = await supabaseAdmin
    .from('processed_stripe_events')
    .select('event_id', { count: 'exact', head: true })
    .eq('event_id', event.id);

  if (count && count > 0) {
    logger.warn({ eventId: event.id }, 'Stripe event already processed');
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info({ sessionId: session.id }, 'Async payment succeeded');
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubId = session.subscription as string | null;
        const stripeCustomerId = session.customer as string | null;
        logger.warn({ sessionId: session.id }, 'Async payment failed');

        if (supabaseAdmin) {
          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeSubId },
                  'Failed to update subscription for async payment failed',
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription by customer ID for async payment failed',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for async payment failed');
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await updateSubscriptionFromStripeSubscription(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        // Access subscription ID (v20 type change)
        const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;

        logger.info({ invoiceId: invoice.id }, 'Payment succeeded for invoice');

        if (supabaseAdmin && stripe) {
          const updateData: {
            status: string;
            current_period_start?: string;
            current_period_end?: string;
          } = { status: 'active' };

          if (stripeSubId) {
            try {
              const subscriptionResponse = await stripe.subscriptions.retrieve(stripeSubId);
              const subscription = subscriptionResponse as unknown as Stripe.Subscription;
              updateData.status = subscription.status;
              const periodStart = (subscription as unknown as { current_period_start: number })
                .current_period_start;
              const periodEnd = (subscription as unknown as { current_period_end: number })
                .current_period_end;
              updateData.current_period_start = new Date(periodStart * 1000).toISOString();
              updateData.current_period_end = new Date(periodEnd * 1000).toISOString();
            } catch (error) {
              logger.error({ error, stripeSubId }, 'Failed to retrieve subscription for invoice');
            }
          }

          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeSubId },
                  'Failed to update subscription for payment succeeded',
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update(updateData)
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription by customer ID for payment succeeded',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for payment succeeded');
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;
        logger.info({ stripeSubId }, 'Subscription deleted');
        if (supabaseAdmin) {
          try {
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'canceled',
                canceled_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', stripeSubId);
            if (updateError) {
              logger.error(
                { error: updateError, stripeSubId },
                'Failed to update subscription for deleted event',
              );
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for deleted event');
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        // Access subscription ID (v20 type change)
        const stripeSubId = (invoice as unknown as { subscription?: string | null }).subscription;
        logger.warn({ invoiceId: invoice.id }, 'Payment failed for invoice');

        if (supabaseAdmin) {
          try {
            if (stripeSubId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_subscription_id', stripeSubId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeSubId },
                  'Failed to update subscription for payment failed',
                );
              }
            } else if (stripeCustomerId) {
              const { error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: 'past_due' })
                .eq('stripe_customer_id', stripeCustomerId);
              if (updateError) {
                logger.error(
                  { error: updateError, stripeCustomerId },
                  'Failed to update subscription by customer ID for payment failed',
                );
              }
            }
          } catch (error) {
            logger.error({ error }, 'Error updating subscription for payment failed');
          }
        }
        break;
      }
      default:
        logger.warn({ eventType: event.type }, 'Unhandled Stripe event type');
    }

    // Add event to processed table
    const { error: insertError } = await supabaseAdmin
      .from('processed_stripe_events')
      .insert({ event_id: event.id });

    if (insertError) {
      logger.error({ eventId: event.id, error: insertError }, 'Failed to insert processed event');
      throw new Error(`Failed to insert processed event ID: ${insertError.message}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        eventType: event.type,
        eventId: event.id,
        stack: err instanceof Error ? err.stack : undefined,
      },
      'Error handling Stripe webhook event',
    );

    return new NextResponse(JSON.stringify({ error: `Webhook handler failed: ${errorMessage}` }), {
      status: 500,
    });
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Webhook processed successfully');
  return NextResponse.json({ received: true, eventType: event.type }, { status: 200 });
}
