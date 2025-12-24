import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn(
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

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.' },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', user.id)
    .single();

  if (error || !subscription) {
    return NextResponse.json({ error: 'No subscription found.' }, { status: 404 });
  }

  // Allow users to access portal even if canceled, to view invoices etc.
  // The only strict requirement is having a customer ID.
  const allowedStatuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];

  if (!subscription.stripe_customer_id) {
    console.error('[billing] Subscription found but no stripe_customer_id:', subscription);
    return NextResponse.json(
      { error: 'No billing account linked to this subscription.' },
      { status: 404 },
    );
  }

  // Optional: Warn if status is weird, but usually Portal handles it.
  if (!allowedStatuses.includes(subscription.status)) {
    console.warn(`[billing] Accessing portal with status: ${subscription.status}`);
  }

  const origin = getOrigin(request);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/pricing`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error('[billing] Failed to create Stripe portal session', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
