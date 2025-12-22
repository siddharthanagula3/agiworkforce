import 'server-only';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';

type PlanTier = 'hobby' | 'free' | 'pro' | 'max' | 'enterprise';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_HOBBY_MONTHLY =
  process.env.STRIPE_PRICE_HOBBY_MONTHLY ?? 'price_1Sgwx10zEfO6BZMh7thtFU77';
const STRIPE_PRICE_HOBBY_YEARLY =
  process.env.STRIPE_PRICE_HOBBY_YEARLY ?? 'price_1Sgwx20zEfO6BZMhbgpxL8TI';
const STRIPE_PRICE_PRO_MONTHLY =
  process.env.STRIPE_PRICE_PRO_MONTHLY ?? 'price_1Sgwx20zEfO6BZMh3ix7hivi';
const STRIPE_PRICE_PRO_YEARLY =
  process.env.STRIPE_PRICE_PRO_YEARLY ?? 'price_1Sgwx30zEfO6BZMhJXsduOyl';
const STRIPE_PRICE_MAX_MONTHLY =
  process.env.STRIPE_PRICE_MAX_MONTHLY ?? 'price_1Sgwx30zEfO6BZMhJqItFYKF';
const STRIPE_PRICE_MAX_YEARLY =
  process.env.STRIPE_PRICE_MAX_YEARLY ?? 'price_1Sgwx40zEfO6BZMhYS63EnfW';

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
  // Enterprise is custom/negotiated pricing, not available via self-serve checkout
  if (plan === 'enterprise') {
    return null;
  }

  if (plan === 'hobby') {
    if (billingInterval === 'monthly') {
      return STRIPE_PRICE_HOBBY_MONTHLY ?? null;
    }
    if (billingInterval === 'annual') {
      return STRIPE_PRICE_HOBBY_YEARLY ?? null;
    }
    return null;
  }

  if (plan === 'pro') {
    if (billingInterval === 'monthly') {
      return STRIPE_PRICE_PRO_MONTHLY ?? null;
    }
    return STRIPE_PRICE_PRO_YEARLY ?? null;
  }

  if (plan === 'max') {
    if (billingInterval === 'monthly') {
      return STRIPE_PRICE_MAX_MONTHLY ?? null;
    }
    return STRIPE_PRICE_MAX_YEARLY ?? null;
  }

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Enterprise is custom/negotiated pricing - direct users to sales/contact
  if (plan === 'enterprise') {
    return NextResponse.json(
      {
        error:
          'Enterprise plans require custom pricing. Please contact sales for more information.',
      },
      { status: 400 },
    );
  }

  const priceId = getPriceIdForPlan(plan, billingInterval);
  if (!priceId) {
    return NextResponse.json({ error: 'Unsupported plan or billing interval' }, { status: 400 });
  }

  const origin = getOrigin(request);

  try {
    // Hobby plan gets a 3-month free trial (90 days)
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        plan_tier: plan,
        supabase_user_id: user.id,
      },
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
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
