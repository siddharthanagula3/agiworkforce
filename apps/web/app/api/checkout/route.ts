import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

type PlanTier = 'free' | 'pro' | 'max' | 'enterprise';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY;
const STRIPE_PRICE_PRO_YEARLY = process.env.STRIPE_PRICE_PRO_YEARLY;

if (!STRIPE_SECRET_KEY) {
  console.warn(
    '[billing] STRIPE_SECRET_KEY is not set. Checkout endpoint will return 500 until configured.',
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

function getPriceIdForPlan(plan: PlanTier, billingInterval: 'monthly' | 'annual'): string | null {
  if (plan === 'pro') {
    if (billingInterval === 'monthly') {
      return STRIPE_PRICE_PRO_MONTHLY ?? null;
    }
    return STRIPE_PRICE_PRO_YEARLY ?? null;
  }

  // For now, only Pro is sold self-serve via this checkout route.
  return null;
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.' },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const plan: PlanTier = body?.plan ?? 'pro';
  const billingInterval: 'monthly' | 'annual' = body?.billingInterval ?? 'monthly';

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const priceId = getPriceIdForPlan(plan, billingInterval);
  if (!priceId) {
    return NextResponse.json({ error: 'Unsupported plan' }, { status: 400 });
  }

  const origin = getOrigin(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/download?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      customer_email: user.email ?? undefined,
      metadata: {
        supabase_user_id: user.id,
        plan_tier: plan,
        billing_interval: billingInterval,
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error('[billing] Failed to create Stripe checkout session', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
