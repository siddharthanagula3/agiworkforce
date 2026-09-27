import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { verifyGooglePubSubPushIdentity } from '@/lib/server/google-pubsub-push-identity';
import { readGmailNotice } from '@/lib/triggers/gmail-watch';
import {
  GMAIL_PUBSUB_AUDIENCE_ENV,
  GMAIL_PUBSUB_SERVICE_ACCOUNT_ENV,
} from '@/lib/triggers/trigger-signatures';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    historyId: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()]),
  })
  .passthrough();

/**
 * Gmail push receiver (Pub/Sub push subscription).
 *
 * Gmail publishes a mailbox-changed notice to the topic; Pub/Sub pushes it here
 * with a Google-signed OIDC token. The token is verified against the audience
 * and service account this deployment expects, and the request is refused when
 * either is unset. The notice carries no message content, only the mailbox and
 * its history id, so each verified trigger on that mailbox lists the inbox
 * messages added since the history id it last reached, through its owner's own
 * Gmail grant, and every new message becomes one event.
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

  const outcome = await readGmailNotice(getNeonDb(), {
    emailAddress: notification.data.emailAddress.toLowerCase(),
    historyId: String(notification.data.historyId),
  });
  if (outcome.retry) {
    return NextResponse.json({ error: 'Gmail could not be read; redeliver' }, { status: 503 });
  }
  return NextResponse.json({ received: true, matched: outcome.matched, queued: outcome.queued });
}

export const POST = withErrorHandler(handleGmailPush);
