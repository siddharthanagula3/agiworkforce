import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { PRICING_CONFIG } from '@/lib/pricing';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/**
 * Manual sync endpoint to fix subscriptions with missing stripe_price_id
 * This can be called to sync a subscription from Stripe to Supabase
 */
async function handleSyncSubscription(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'sync-subscription');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe || !supabaseAdmin) {
    throw createError.serviceUnavailable('Stripe or Supabase not configured');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  try {
    // Get user's subscription from Supabase (may or may not exist yet)
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      // PGRST116 = no rows found; that's expected when healing a missing subscription
      logger.error(
        {
          userId: user.id,
          error: subscriptionError,
        },
        'Failed to fetch subscription from Supabase',
      );
      throw createError.supabase('Failed to fetch subscription', subscriptionError);
    }

    let stripeSubscription: Stripe.Subscription | null = null;

    if (!subscription) {
      // Logic for missing local subscription: Try to find in Stripe by email
      if (!user.email) {
        throw createError.validation('User has no email address');
      }

      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        throw createError.notFound('No subscription or customer found');
      }

      const customerId = customers.data[0].id;
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1,
        expand: ['data.items.data.price'],
      });

      if (subscriptions.data.length === 0) {
        throw createError.notFound('No active subscription found in Stripe');
      }

      stripeSubscription = subscriptions.data[0];
    } else {
      // Existing local subscription logic
      if (!subscription.stripe_subscription_id) {
        throw createError.validation('Subscription has no Stripe subscription ID');
      }

      stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id,
        {
          expand: ['items.data.price'],
        },
      );
    }

    // Get price_id from Stripe subscription
    let stripePriceId: string | null = null;
    if (stripeSubscription.items.data.length > 0) {
      stripePriceId = stripeSubscription.items.data[0].price.id;
    }

    if (!stripePriceId) {
      throw createError.internal('Could not retrieve price ID from Stripe subscription');
    }

    // Determine plan tier, preferring explicit metadata but falling back to price mapping
    const { getPlanFromPriceId } = PRICING_CONFIG;
    const planTier =
      stripeSubscription.metadata?.plan_tier ||
      (stripePriceId ? getPlanFromPriceId(stripePriceId) : null) ||
      'pro';

    const baseSubscriptionData = {
      user_id: user.id,
      stripe_customer_id:
        typeof stripeSubscription.customer === 'string'
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
      stripe_subscription_id: stripeSubscription.id,
      stripe_price_id: stripePriceId,
      status: stripeSubscription.status,
      plan_tier: planTier,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      canceled_at: stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
      stripe_coupon_id: stripeSubscription.discount?.coupon?.id || null,
    } as const;

    // Upsert Supabase subscription with graceful fallback if some columns are missing
    let { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(baseSubscriptionData, { onConflict: 'user_id' });

    if (updateError) {
      const isUndefinedColumnError =
        typeof updateError === 'object' && updateError !== null && 'code' in updateError
          ? (updateError as { code?: string }).code === '42703'
          : false;

      if (isUndefinedColumnError) {
        // Some environments may not yet have optional columns like stripe_coupon_id.
        // Retry with a minimal, backwards-compatible payload.
        logger.warn(
          {
            userId: user.id,
            subscriptionId: stripeSubscription.id,
            error: updateError,
          },
          'Subscriptions table missing one or more columns; retrying upsert with minimal fields',
        );

        const minimalData = {
          user_id: baseSubscriptionData.user_id,
          stripe_customer_id: baseSubscriptionData.stripe_customer_id,
          stripe_subscription_id: baseSubscriptionData.stripe_subscription_id,
          stripe_price_id: baseSubscriptionData.stripe_price_id,
          status: baseSubscriptionData.status,
          plan_tier: baseSubscriptionData.plan_tier,
          current_period_start: baseSubscriptionData.current_period_start,
          current_period_end: baseSubscriptionData.current_period_end,
          cancel_at_period_end: baseSubscriptionData.cancel_at_period_end,
          canceled_at: baseSubscriptionData.canceled_at,
          updated_at: baseSubscriptionData.updated_at,
        };

        const fallbackResult = await supabaseAdmin
          .from('subscriptions')
          .upsert(minimalData, { onConflict: 'user_id' });
        updateError = fallbackResult.error;
      }

      if (updateError) {
        logger.error(
          {
            userId: user.id,
            subscriptionId: stripeSubscription.id,
            error: updateError,
          },
          'Error updating subscription',
        );
        throw createError.internal('Failed to update subscription');
      }
    }

    // Get credit balance
    let creditBalance = null;
    try {
      creditBalance = await CreditService.getBalance(user.id);
    } catch (creditError) {
      logger.warn(
        {
          error: creditError,
          userId: user.id,
        },
        'Failed to get credit balance during sync',
      );
      // Don't fail the sync if credit balance fetch fails
    }

    logger.info(
      {
        userId: user.id,
        subscriptionId: stripeSubscription.id,
        priceId: stripePriceId,
      },
      'Subscription synced successfully',
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription synced successfully',
      stripe_price_id: stripePriceId,
      credits: creditBalance,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      },
      'Error in sync-subscription',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleSyncSubscription);
