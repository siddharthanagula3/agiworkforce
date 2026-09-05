import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getStripeWebhookDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { withSpan, type ActiveSpan } from '@/lib/observability/span';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
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

const stripe = getStripeClientOrNull();

export async function POST(request: NextRequest) {
  return withSpan('stripe.webhook', { kind: 'server', domain: 'billing' }, (span) =>
    handleStripeWebhook(request, span),
  );
}

async function handleStripeWebhook(request: NextRequest, span: ActiveSpan) {
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

  const db = getStripeWebhookDb();

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

    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
    });
  }

  logger.info({ eventType: event.type, eventId: event.id }, 'Webhook processed successfully');
  span.setAttributes({ 'stripe.webhook.outcome': 'processed' });
  return NextResponse.json({ received: true, eventType: event.type }, { status: 200 });
}
