import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { ingestTriggerEvent } from '@/lib/triggers/trigger-ingest';
import {
  GOOGLE_CALENDAR_CHANNEL_SECRET_ENV,
  verifyGoogleCalendarChannelToken,
} from '@/lib/triggers/trigger-signatures';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOURCE_STATE_EVENTS: Readonly<Record<string, string>> = {
  exists: 'events.changed',
  not_exists: 'events.deleted',
};

/**
 * Google Calendar push receiver.
 *
 * A watch channel is registered with the trigger's own id as the channel id and
 * a token derived from this deployment's channel secret, so a notification that
 * does not carry that exact token is refused. Google sends a 'sync' state when
 * a channel opens; that is acknowledged without firing anything. The
 * notification carries no event content, so the triggered agent reads the
 * calendar through the account's own connector.
 */
async function handleCalendarNotification(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'trigger-webhook');
  if (rateLimited) return rateLimited;

  const channelId = request.headers.get('x-goog-channel-id') ?? '';
  const resourceState = request.headers.get('x-goog-resource-state') ?? '';
  const messageNumber = request.headers.get('x-goog-message-number') ?? '';
  if (!UUID_RE.test(channelId)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  }

  const verification = verifyGoogleCalendarChannelToken(
    channelId,
    request.headers.get('x-goog-channel-token'),
  );
  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      logger.error(
        `${GOOGLE_CALENDAR_CHANNEL_SECRET_ENV} is not set; calendar pushes are refused until it is`,
      );
      return NextResponse.json({ error: 'Calendar push is not configured' }, { status: 503 });
    }
    logger.warn({ channelId }, 'Calendar channel token rejected');
    return NextResponse.json({ error: 'Invalid channel token' }, { status: 401 });
  }

  if (resourceState === 'sync') {
    return NextResponse.json({ received: true, state: 'sync' });
  }

  const type = RESOURCE_STATE_EVENTS[resourceState];
  if (!type) return NextResponse.json({ received: true, matched: 0 });

  const outcomes = await ingestTriggerEvent(getNeonDb(), {
    source: 'google_calendar',
    type,
    deliveryId: `${channelId}:${messageNumber || Date.now()}`,
    account: null,
    triggerId: channelId,
    installationId: null,
    occurredAt: new Date().toISOString(),
    data: {
      channelId,
      resourceState,
      resourceId: request.headers.get('x-goog-resource-id')?.slice(0, 200) ?? null,
      resourceUri: request.headers.get('x-goog-resource-uri')?.slice(0, 500) ?? null,
    },
  });

  return NextResponse.json({
    received: true,
    matched: outcomes.length,
    queued: outcomes.filter((outcome) => outcome.outcome === 'enqueued').length,
  });
}

export const POST = withErrorHandler(handleCalendarNotification);
