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

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { withSpan, type ActiveSpan } from '@/lib/observability/span';
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
      apiVersion: STRIPE_API_VERSION,
    })
  : null;

/**
 * Stripe webhook ingress.
 *
 * This route does not go through `withErrorHandler`, so the `billing` span here
 * is what establishes the trace context (SCALE-VER-006): every `logger.*` line
 * below — and every span inside `dispatchStripeEvent` — shares one `trace_id`,
 * which is how a disputed charge is traced from Stripe's event id to the credit
 * grant it produced.
 */
export async function POST(request: NextRequest) {
  return withSpan('stripe.webhook', { kind: 'server', domain: 'billing' }, (span) =>
    handleStripeWebhook(request, span),
  );
}

async function handleStripeWebhook(request: NextRequest, span: ActiveSpan) {
  // H5: Rate limit webhook endpoint to prevent abuse (generous limit for legitimate Stripe traffic)
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) {
    span.setAttributes({ 'stripe.webhook.outcome': 'rate_limited' });
    return rateLimitResponse;
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe not configured');
    span.setAttributes({ 'stripe.webhook.outcome': 'not_configured' });
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const db = getNeonDb();

  const verifyResult = await verifyStripeSignature(request, stripe, STRIPE_WEBHOOK_SECRET);
  if ('error' in verifyResult) {
    span.setAttributes({ 'stripe.webhook.outcome': 'signature_rejected' });
    return verifyResult.error;
  }
  const { event } = verifyResult;
  span.setAttributes({ 'stripe.event.id': event.id, 'stripe.event.type': event.type });

  const idempotencyResult = await checkIdempotency(db, event.id);
  if ('error' in idempotencyResult) {
    span.setAttributes({ 'stripe.webhook.outcome': 'idempotency_error' });
    return idempotencyResult.error;
  }
  if (!idempotencyResult.shouldProcess) {
    span.setAttributes({ 'stripe.webhook.outcome': `skipped_${idempotencyResult.state}` });
    if (idempotencyResult.state === 'processing') {
      return NextResponse.json(
        { error: 'Event processing is still in progress' },
        { status: 503, headers: { 'Retry-After': '10' } },
      );
    }
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  try {
    // Financial state changes and the durable succeeded marker share one
    // transaction. If either fails, Neon rolls back both so a Stripe retry
    // cannot double-apply credits or permanently acknowledge partial state.
    await db.transaction(async (tx) => {
      await dispatchStripeEvent(tx, stripe, event);
      await markEventSucceeded(tx, event.id);
    });
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

    await markEventFailed(db, event.id, errorMessage);
    span.setAttributes({ 'stripe.webhook.outcome': 'dispatch_failed' });

    // WEB-7 (audit 2026-05-03): return a generic body. The previous
    // `errorMessage` interpolation leaked internal details (column names,
    // SQL constraint names, stack traces) to anyone able to forge a webhook
    // signature, AND surfaced the same string in Stripe's dashboard on
    // retries. Server-side `logger.error` above already captured the full error.
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
    });
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Webhook processed successfully');
  span.setAttributes({ 'stripe.webhook.outcome': 'processed' });
  return NextResponse.json({ received: true, eventType: event.type }, { status: 200 });
}
