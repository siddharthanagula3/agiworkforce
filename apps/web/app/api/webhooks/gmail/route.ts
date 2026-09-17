import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { verifyGooglePubSubPushIdentity } from '@/lib/server/google-pubsub-push-identity';
import { ingestTriggerEvent } from '@/lib/triggers/trigger-ingest';
import {
  GMAIL_PUBSUB_AUDIENCE_ENV,
  GMAIL_PUBSUB_SERVICE_ACCOUNT_ENV,
} from '@/lib/triggers/trigger-signatures';
import { GMAIL_TRIGGER_EVENT_TYPES } from '@/lib/triggers/trigger-types';

export const runtime = 'nodejs';

const PubSubEnvelopeSchema = z
  .object({
    message: z.object({
      data: z.string().min(1).max(64_000),
      messageId: z.string().min(1).max(200),
      publishTime: z.string().max(64).optional(),
    }),
    subscription: z.string().max(400).optional(),
  })
  .strict();

const GmailNotificationSchema = z
  .object({
    emailAddress: z.string().min(3).max(320),
    historyId: z.union([z.string().max(64), z.number()]),
  })
  .passthrough();

/**
 * Gmail push receiver (Pub/Sub push subscription).
 *
 * Gmail publishes a mailbox-changed notice to the topic; Pub/Sub pushes it here
 * with a Google-signed OIDC token. The token is verified against the audience
 * and service account this deployment expects, and the request is refused when
 * either is unset. The notice carries no message content, only the mailbox and
 * its history id, so a trigger's agent reads the mailbox itself through the
 * account's own connector.
 */
async function handleGmailPush(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'trigger-webhook');
  if (rateLimited) return rateLimited;

  const identity = await verifyGooglePubSubPushIdentity(request.headers.get('authorization'), {
    audience: process.env[GMAIL_PUBSUB_AUDIENCE_ENV],
    serviceAccountEmail: process.env[GMAIL_PUBSUB_SERVICE_ACCOUNT_ENV],
  });
  if (!identity.ok) {
    if (identity.reason === 'not_configured') {
      logger.error(
        `${GMAIL_PUBSUB_AUDIENCE_ENV} and ${GMAIL_PUBSUB_SERVICE_ACCOUNT_ENV} must be set before Gmail push is accepted`,
      );
      return NextResponse.json({ error: 'Gmail push is not configured' }, { status: 503 });
    }
    logger.warn({ reason: identity.reason }, 'Gmail push identity rejected');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const envelope = PubSubEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!envelope.success) {
    return NextResponse.json({ error: 'Invalid Pub/Sub envelope' }, { status: 400 });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(envelope.data.message.data, 'base64').toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid Gmail notification' }, { status: 400 });
  }
  const notification = GmailNotificationSchema.safeParse(decoded);
  if (!notification.success) {
    return NextResponse.json({ error: 'Invalid Gmail notification' }, { status: 400 });
  }

  const emailAddress = notification.data.emailAddress.toLowerCase();
  const outcomes = await ingestTriggerEvent(getNeonDb(), {
    source: 'gmail',
    type: GMAIL_TRIGGER_EVENT_TYPES[0],
    deliveryId: envelope.data.message.messageId,
    account: emailAddress,
    triggerId: null,
    installationId: null,
    occurredAt: envelope.data.message.publishTime ?? new Date().toISOString(),
    data: { emailAddress, historyId: String(notification.data.historyId) },
  });

  return NextResponse.json({
    received: true,
    matched: outcomes.length,
    queued: outcomes.filter((outcome) => outcome.outcome === 'enqueued').length,
  });
}

export const POST = withErrorHandler(handleGmailPush);
