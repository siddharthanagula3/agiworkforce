import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { logInvalidSignature } from '@/lib/security-audit';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';

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
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret, 60);
    if (event.api_version && event.api_version !== STRIPE_API_VERSION) {
      logger.warn(
        {
          eventId: event.id,
          eventType: event.type,
          eventApiVersion: event.api_version,
          pinnedApiVersion: STRIPE_API_VERSION,
        },
        'Stripe webhook endpoint API version differs from the pinned SDK version',
      );
    }
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
