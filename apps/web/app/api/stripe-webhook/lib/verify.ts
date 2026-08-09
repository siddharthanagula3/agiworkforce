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
    // SEV-WEB-HIGH-5 fix: shorten the replay window from the SDK default of
    // 300 s to 60 s. Stripe recommends 60 s; the longer window only matters
    // when retries take more than a minute, and we have idempotency on top.
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret, 60);
    // BIZ-014: Stripe stamps every delivery with the API version configured on
    // the webhook endpoint, which can drift from the version this deployment
    // pins its SDK and its types to. Drift changes payload shapes silently.
    // This does NOT reject the event — a rejected delivery Stripe retries
    // forever is worse than a shape mismatch the handlers already absorb (they
    // re-fetch the version-sensitive objects through the pinned client and
    // `lib/stripe-types.ts` shims the moved period fields). It only makes the
    // drift visible instead of invisible.
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
