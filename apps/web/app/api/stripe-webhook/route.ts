import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// WEB-4 audit fix (2026-05-03): pin to Node runtime so the Stripe SDK's
// HMAC verification (stripe.webhooks.constructEvent) has access to Node
// crypto. Edge runtime would silently fail signature checks. Also marks
// this route as dynamic so Next.js doesn't try to pre-render or cache it.
// Pairs with the proxy.ts matcher exclusion that keeps middleware off this
// route entirely.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getServiceClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { checkRateLimit, verifyStripeSignature } from './lib/verify';
import { checkIdempotency, markEventSucceeded, markEventFailed } from './lib/idempotency';
import { dispatchStripeEvent } from './lib/handlers';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'];
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'];

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  logger.error(
    'Stripe webhook is not fully configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel environment variables.',
  );
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    })
  : null;

function getAdminClient() {
  try {
    return getServiceClient();
  } catch {
    logger.error(
      'Supabase service role environment variables are missing. Webhook cannot update subscriptions.',
    );
    return null;
  }
}

const supabaseAdmin = getAdminClient();

export async function POST(request: NextRequest) {
  // H5: Rate limit webhook endpoint to prevent abuse (generous limit for legitimate Stripe traffic)
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin not configured');
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const verifyResult = await verifyStripeSignature(request, stripe, STRIPE_WEBHOOK_SECRET);
  if ('error' in verifyResult) {
    return verifyResult.error;
  }
  const { event } = verifyResult;

  const idempotencyResult = await checkIdempotency(supabaseAdmin, event.id);
  if ('error' in idempotencyResult) {
    return idempotencyResult.error;
  }
  if (!idempotencyResult.shouldProcess) {
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  try {
    await dispatchStripeEvent(supabaseAdmin, stripe, event);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        eventType: event.type,
        eventId: event.id,
        stack: err instanceof Error ? err.stack : undefined,
      },
      'Error handling Stripe webhook event',
    );

    await markEventFailed(supabaseAdmin, event.id, errorMessage);

    // WEB-7 (audit 2026-05-03): return a generic body. The previous
    // `errorMessage` interpolation leaked internal details (Supabase
    // column names, SQL constraint names, stack traces) to anyone able
    // to forge a webhook signature, AND surfaced the same string in
    // Stripe's dashboard on retries. Server-side `logger.error` above
    // already captured the full error.
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
    });
  }

  await markEventSucceeded(supabaseAdmin, event.id);

  logger.info({ eventType: event.type, eventId: event.id }, 'Webhook processed successfully');
  return NextResponse.json({ received: true, eventType: event.type }, { status: 200 });
}
