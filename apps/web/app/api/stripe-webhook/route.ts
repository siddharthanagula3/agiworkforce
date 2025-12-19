import 'server-only';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database'; // local lightweight type (to be created) or fallback to any if missing

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
      apiVersion: '2024-06-20',
    })
  : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin) return;

  const supabaseUserId = session.metadata?.['supabase_user_id'];
  if (!supabaseUserId) {
    return;
  }

  const planTier = (session.metadata?.['plan_tier'] as string | undefined) ?? 'pro';
  const stripeCustomerId = session.customer as string | null;
  const stripeSubId = session.subscription as string | null;
  const priceId =
    (session.display_items &&
      ((session.display_items[0] as Stripe.Checkout.SessionDisplayItem)?.price?.id ?? null)) ||
    (session.line_items &&
      Array.isArray(session.line_items.data) &&
      (session.line_items.data[0]?.price?.id ?? null)) ||
    null;

  await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: supabaseUserId,
        status: 'active',
        plan_tier: planTier,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        stripe_price_id: priceId,
      },
      { onConflict: 'user_id' },
    );
}

export async function POST(request: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = headers().get('stripe-signature');

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
      case 'invoice.payment_succeeded': {
        // For renewals, keep status active
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string | null;
        if (supabaseAdmin && stripeCustomerId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_customer_id', stripeCustomerId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', stripeSubId);
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


