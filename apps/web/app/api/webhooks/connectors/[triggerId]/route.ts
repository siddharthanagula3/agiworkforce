import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { ingestTriggerEvent } from '@/lib/triggers/trigger-ingest';
import {
  EVENT_TRIGGER_SIGNING_SECRET_ENV,
  verifyConnectorTriggerSignature,
} from '@/lib/triggers/trigger-signatures';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 128 * 1024;
const EVENT_TYPE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const DELIVERY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/;

/**
 * Generic connector event receiver.
 *
 * Each connector trigger has its own signing secret, derived from this
 * deployment's key and the trigger id, so a sender proves it holds the secret
 * for that one trigger. Without the deployment key nothing is accepted.
 */
async function handleConnectorEvent(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'trigger-webhook');
  if (rateLimited) return rateLimited;

  const { triggerId } = await context.params;
  if (!UUID_RE.test(triggerId)) {
    return NextResponse.json({ error: 'Unknown trigger' }, { status: 400 });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const verification = verifyConnectorTriggerSignature({
    triggerId,
    body,
    timestamp: request.headers.get('x-agi-timestamp'),
    signature: request.headers.get('x-agi-signature'),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      logger.error(
        `${EVENT_TRIGGER_SIGNING_SECRET_ENV} is not set; connector events are refused until it is`,
      );
      return NextResponse.json({ error: 'Connector events are not configured' }, { status: 503 });
    }
    logger.warn({ triggerId, reason: verification.reason }, 'Connector event signature rejected');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not an object');
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const type = typeof payload['type'] === 'string' ? payload['type'] : '';
  const deliveryId = typeof payload['id'] === 'string' ? payload['id'] : '';
  if (!EVENT_TYPE_RE.test(type) || !DELIVERY_ID_RE.test(deliveryId)) {
    return NextResponse.json({ error: 'Body must carry an id and a type' }, { status: 400 });
  }
  const data =
    payload['data'] && typeof payload['data'] === 'object' && !Array.isArray(payload['data'])
      ? (payload['data'] as Record<string, unknown>)
      : {};

  const outcomes = await ingestTriggerEvent(getNeonDb(), {
    source: 'connector',
    type,
    deliveryId,
    account: null,
    triggerId,
    installationId: null,
    occurredAt: new Date().toISOString(),
    data,
  });

  return NextResponse.json({
    received: true,
    matched: outcomes.length,
    queued: outcomes.filter((outcome) => outcome.outcome === 'enqueued').length,
  });
}

export const POST = withErrorHandler(handleConnectorEvent);
