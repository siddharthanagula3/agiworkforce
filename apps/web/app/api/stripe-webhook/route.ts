import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.warn(
    '[billing] Stripe webhook is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[billing] Supabase service role env vars are missing. Webhook cannot update subscriptions.',
  );
}

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

async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin || !stripe) return;

  const supabaseUserId = session.metadata?.['supabase_user_id'];
  if (!supabaseUserId) {
    return;
  }

  const planTier = (session.metadata?.['plan_tier'] as string | undefined) ?? 'pro';
  const stripeCustomerId = session.customer as string | null;
  const stripeSubId = session.subscription as string | null;

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
      console.error('[billing] Failed to retrieve expanded session:', error);
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
      const subscription = await stripe.subscriptions.retrieve(stripeSubId);
      status = subscription.status;
      currentPeriodStart = new Date(subscription.current_period_start * 1000);
      currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      canceledAt = subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

      if (!stripePriceId && subscription.items.data.length > 0) {
        stripePriceId = subscription.items.data[0].price.id;
      }

      if (subscription.discount?.coupon?.id) {
        stripeCouponId = subscription.discount.coupon.id;
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve subscription details:', error);
    }
  }

  if (!stripeCouponId && stripe && session.id) {
    try {
      const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['total_details.breakdown'],
      });

      if (expandedSession.total_details?.breakdown?.discounts) {
        const discount = expandedSession.total_details.breakdown.discounts[0];
        if (discount?.discount?.coupon?.id) {
          stripeCouponId = discount.discount.coupon.id;
        }
      }
    } catch (error) {
      console.error('[billing] Failed to retrieve session discount details:', error);
    }
  }

  await supabaseAdmin.from('subscriptions').upsert(
    {
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
    },
    { onConflict: 'user_id' },
  );
}

async function updateSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  if (!supabaseAdmin) return;

  const stripeSubId = subscription.id;
  const stripeCustomerId = subscription.customer as string | null;

  let stripePriceId: string | null = null;
  if (subscription.items.data.length > 0) {
    stripePriceId = subscription.items.data[0].price.id;
  }

  let planTier: string = 'pro';
  if (subscription.metadata?.plan_tier) {
    planTier = subscription.metadata.plan_tier;
  }

  const updateData: {
    status: string;
    stripe_price_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    stripe_coupon_id?: string | null;
    plan_tier?: string;
  } = {
    status: subscription.status,
    stripe_price_id: stripePriceId,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_coupon_id: subscription.discount?.coupon.id || null,
  };

  if (subscription.metadata?.plan_tier) {
    updateData.plan_tier = planTier;
  }

  if (stripeSubId) {
    await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_subscription_id', stripeSubId);
  } else if (stripeCustomerId) {
    await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);
  }
}

export async function POST(request: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing] Stripe webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await upsertSubscriptionFromSession(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await updateSubscriptionFromStripeSubscription(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        const stripeSubId = invoice.subscription as string | null;

        if (supabaseAdmin && stripe) {
          const updateData: {
            status: string;
            current_period_start?: string;
            current_period_end?: string;
          } = { status: 'active' };

          if (stripeSubId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(stripeSubId);
              updateData.status = subscription.status;
              updateData.current_period_start = new Date(
                subscription.current_period_start * 1000,
              ).toISOString();
              updateData.current_period_end = new Date(
                subscription.current_period_end * 1000,
              ).toISOString();
            } catch (error) {
              console.error('[billing] Failed to retrieve subscription for invoice:', error);
            }
          }

          if (stripeSubId) {
            await supabaseAdmin
              .from('subscriptions')
              .update(updateData)
              .eq('stripe_subscription_id', stripeSubId);
          } else if (stripeCustomerId) {
            await supabaseAdmin
              .from('subscriptions')
              .update(updateData)
              .eq('stripe_customer_id', stripeCustomerId);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', stripeSubId);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        const stripeSubId = invoice.subscription as string | null;

        if (supabaseAdmin) {
          if (stripeSubId) {
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_subscription_id', stripeSubId);
          } else if (stripeCustomerId) {
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_customer_id', stripeCustomerId);
          }
        }
        break;
      }
      default:
        console.log(`[billing] Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error('[billing] Error handling Stripe webhook event', err);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
