import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { logger } from '@/lib/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
});

/**
 * POST /api/credit-topup
 * Create a Stripe Checkout session for purchasing additional credits
 * This is primarily for Max plan users who need more credits
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount_cents } = body;

    // Validate amount (default to $100 if not specified)
    const creditAmount = amount_cents || 10000; // 10000 cents = $100

    // Validate amount is reasonable ($10 min, $1000 max)
    if (creditAmount < 1000 || creditAmount > 100000) {
      return NextResponse.json(
        { error: 'Invalid top-up amount. Must be between $10 and $1,000.' },
        { status: 400 },
      );
    }

    // Get user's profile to check for existing Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', session.user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: {
          supabase_user_id: session.user.id,
        },
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', session.user.id);
    }

    // Get the success and cancel URLs
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL;
    const successUrl = `${baseUrl}/dashboard/billing?topup=success`;
    const cancelUrl = `${baseUrl}/dashboard/billing?topup=cancelled`;

    // Create Stripe Checkout session for one-time credit purchase
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment', // One-time payment, not subscription
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `AI Credits Top-Up`,
              description: `One-time purchase of $${(creditAmount / 100).toFixed(2)} in AI usage credits`,
              metadata: {
                type: 'credit_topup',
              },
            },
            unit_amount: creditAmount, // Amount in cents
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: session.user.id,
        type: 'credit_topup',
        credit_amount_cents: creditAmount.toString(),
      },
      payment_intent_data: {
        metadata: {
          user_id: session.user.id,
          type: 'credit_topup',
          credit_amount_cents: creditAmount.toString(),
        },
      },
    });

    logger.info(
      {
        userId: session.user.id,
        sessionId: checkoutSession.id,
        amount: creditAmount,
      },
      'Credit top-up checkout session created',
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    logger.error({ error }, 'Error creating credit top-up checkout session');
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Failed to create checkout session',
        },
      },
      { status: 500 },
    );
  }
}
