// apps/web/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { plan, billingInterval } = await req.json();

    if (!plan || !billingInterval) {
      return new NextResponse('Missing plan or billingInterval', { status: 400 });
    }

    // Lookup Price ID
    const planPrices = STRIPE_PRICE_IDS[plan as keyof typeof STRIPE_PRICE_IDS];
    const priceId = planPrices ? planPrices[billingInterval as 'monthly' | 'annual'] : null;

    if (!priceId) {
      return new NextResponse('Invalid plan configuration', { status: 400 });
    }

    // Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      metadata: {
        userId: session.user.id,
        plan_tier: plan, // Useful for the webhook
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Checkout error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
