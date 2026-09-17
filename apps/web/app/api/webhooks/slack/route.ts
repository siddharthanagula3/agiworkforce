import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { ingestTriggerEvent } from '@/lib/triggers/trigger-ingest';
import { SLACK_SIGNING_SECRET_ENV, verifySlackSignature } from '@/lib/triggers/trigger-signatures';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TEXT = 2_000;

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event_time?: number;
  event?: Record<string, unknown>;
}

function text(value: unknown, limit = MAX_TEXT): string | null {
  return typeof value === 'string' ? value.slice(0, limit) : null;
}

/**
 * Slack Events API receiver.
 *
 * Verifies the request with the app's signing secret and fails closed when the
 * secret is unset, answers the url_verification handshake, and hands anything
 * else to the trigger ingest. It never runs an agent inline: Slack retries a
 * delivery it does not see acknowledged within three seconds.
 */
async function handleSlackEvent(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'trigger-webhook');
  if (rateLimited) return rateLimited;

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const verification = verifySlackSignature({
    body,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    secret: process.env[SLACK_SIGNING_SECRET_ENV],
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      logger.error(`${SLACK_SIGNING_SECRET_ENV} is not set; Slack events are refused until it is`);
      return NextResponse.json({ error: 'Slack events are not configured' }, { status: 503 });
    }
    logger.warn({ reason: verification.reason }, 'Slack event signature rejected');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(body) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (envelope.type === 'url_verification') {
    return NextResponse.json({ challenge: text(envelope.challenge, 1_000) ?? '' });
  }

  const teamId = text(envelope.team_id, 32)?.toUpperCase() ?? null;
  const event = envelope.event ?? {};
  const eventType = text(event['type'], 64);
  const deliveryId = text(envelope.event_id, 200);
  if (envelope.type !== 'event_callback' || !teamId || !eventType || !deliveryId) {
    return NextResponse.json({ received: true, matched: 0 });
  }

  const outcomes = await ingestTriggerEvent(getNeonDb(), {
    source: 'slack',
    type: eventType,
    deliveryId,
    account: teamId,
    triggerId: null,
    installationId: null,
    occurredAt: new Date(
      (envelope.event_time ?? Math.floor(Date.now() / 1000)) * 1000,
    ).toISOString(),
    data: {
      teamId,
      channel: text(event['channel'], 64),
      user: text(event['user'], 64),
      text: text(event['text']),
      ts: text(event['ts'], 64),
      threadTs: text(event['thread_ts'], 64),
      subtype: text(event['subtype'], 64),
    },
  });

  return NextResponse.json({
    received: true,
    matched: outcomes.length,
    queued: outcomes.filter((outcome) => outcome.outcome === 'enqueued').length,
  });
}

export const POST = withErrorHandler(handleSlackEvent);
