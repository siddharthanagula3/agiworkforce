import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../../services/supabase-server';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
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
export async function POST(_request: Request) {
  if (!stripe || !supabaseAdmin) {
    return NextResponse.json({ error: 'Stripe or Supabase not configured' }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user's subscription from Supabase
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Subscription has no Stripe subscription ID' },
        { status: 400 },
      );
    }

    // Retrieve subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
      {
        expand: ['items.data.price'],
      },
    );

    // Get price_id from Stripe subscription
    let stripePriceId: string | null = null;
    if (stripeSubscription.items.data.length > 0) {
      stripePriceId = stripeSubscription.items.data[0].price.id;
    }

    if (!stripePriceId) {
      return NextResponse.json(
        { error: 'Could not retrieve price ID from Stripe subscription' },
        { status: 500 },
      );
    }

    // Update Supabase subscription with price_id
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        stripe_price_id: stripePriceId,
        status: stripeSubscription.status,
        current_period_start: new Date(
          stripeSubscription.current_period_start * 1000,
        ).toISOString(),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        canceled_at: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[sync-subscription] Error updating subscription:', updateError);
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription synced successfully',
      stripe_price_id: stripePriceId,
    });
  } catch (error) {
    console.error('[sync-subscription] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
