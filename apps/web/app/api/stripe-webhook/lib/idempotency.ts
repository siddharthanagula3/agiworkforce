import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

export async function checkIdempotency(
  db: DatabaseAdapter,
  eventId: string,
): Promise<
  | { shouldProcess: true }
  | { shouldProcess: false; state: 'succeeded' | 'processing' }
  | { error: NextResponse }
> {
  try {
    const rows = await db.query<{ process_stripe_event_idempotent: boolean }>(
      'select * from process_stripe_event_idempotent($1)',
      [eventId],
    );
    const shouldProcess = Boolean(rows[0]?.process_stripe_event_idempotent);

    if (shouldProcess) {
      return { shouldProcess: true };
    }

    const eventRows = await db.query<{ status: string }>(
      'select status from processed_stripe_events where event_id = $1 limit 1',
      [eventId],
    );
    const status = eventRows[0]?.status;
    if (status === 'succeeded') {
      logger.warn({ eventId }, 'Stripe event already processed (idempotent skip)');
      return { shouldProcess: false, state: 'succeeded' };
    }
    if (status === 'processing') {
      logger.warn({ eventId }, 'Stripe event is already being processed');
      return { shouldProcess: false, state: 'processing' };
    }

    logger.error({ eventId, status }, 'Stripe idempotency function returned an invalid state');
    return {
      error: NextResponse.json({ error: 'Idempotency state invalid' }, { status: 500 }),
    };
  } catch (idempotencyError) {
    logger.error({ eventId, error: idempotencyError }, 'Failed to check event idempotency');
    return { error: NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 }) };
  }
}

export async function markEventSucceeded(db: DatabaseAdapter, eventId: string): Promise<void> {
  try {
    await db.execute('select mark_stripe_event_succeeded($1)', [eventId]);
  } catch (markError) {
    logger.error({ error: markError, eventId }, 'Failed to mark Stripe event as succeeded');
    throw markError;
  }
}

export async function markEventFailed(
  db: DatabaseAdapter,
  eventId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await db.execute('select mark_stripe_event_failed($1, $2)', [eventId, errorMessage]);
  } catch (markError) {
    logger.error({ error: markError, eventId }, 'Failed to mark Stripe event as failed');
  }
}
