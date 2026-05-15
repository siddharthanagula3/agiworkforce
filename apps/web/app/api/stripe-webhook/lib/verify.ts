import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { logInvalidSignature } from '@/lib/security-audit';

export async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  return withRateLimit(request, 'stripe-webhook');
}

export async function verifyStripeSignature(
  request: NextRequest,
  stripe: Stripe,
  webhookSecret: string,
): Promise<{ event: Stripe.Event } | { error: NextResponse }> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.error('Missing Stripe signature');
    return { error: NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 }) };
  }

  try {
    // SEV-WEB-HIGH-5 fix: shorten the replay window from the SDK default of
    // 300 s to 60 s. Stripe recommends 60 s; the longer window only matters
    // when retries take more than a minute, and we have idempotency on top.
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret, 60);
    logger.info({ eventType: event.type, eventId: event.id }, 'Webhook verified');
    return { event };
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Stripe webhook signature verification failed',
    );
    await logInvalidSignature(request, 'stripe_webhook');
    return { error: NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) };
  }
}
