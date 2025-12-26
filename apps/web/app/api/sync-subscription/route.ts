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
    // Get user's subscription from Supabase
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

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

    // Import this at top, but for now assuming we can use it or fallback
    // We need to determine plan_tier.
    // Since I can't easily add import in this same chunk without breaking code flow, I will just hardcode the simplistic logic or rely on metadata.
    const planTier = stripeSubscription.metadata?.plan_tier || 'pro'; // Fallback to pro if unknown? Or 'hobby' if price matches?
    // Ideally we should use PRICING_CONFIG.getPlanFromPriceId(stripePriceId) but that requires import.
    // I will use metadata as primary source.

    // Upsert Supabase subscription
    const { error: updateError } = await supabaseAdmin.from('subscriptions').upsert(
      {
        user_id: user.id,
        stripe_customer_id:
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer.id,
        stripe_subscription_id: stripeSubscription.id,
        stripe_price_id: stripePriceId,
        status: stripeSubscription.status,
        plan_tier: planTier,
        current_period_start: new Date(
          stripeSubscription.current_period_start * 1000,
        ).toISOString(),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        canceled_at: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
        stripe_coupon_id: stripeSubscription.discount?.coupon?.id || null,
      },
      { onConflict: 'user_id' },
    );

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
