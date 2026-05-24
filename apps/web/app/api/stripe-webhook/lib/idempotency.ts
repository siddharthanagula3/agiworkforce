import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

export async function checkIdempotency(
  db: DatabaseAdapter,
  eventId: string,
): Promise<{ shouldProcess: boolean } | { error: NextResponse }> {
  try {
    const rows = await db.query<{ process_stripe_event_idempotent: boolean }>(
      'select * from process_stripe_event_idempotent($1)',
      [eventId],
    );
    const shouldProcess = Boolean(rows[0]?.process_stripe_event_idempotent);

    if (!shouldProcess) {
      logger.warn({ eventId }, 'Stripe event already processed (idempotent skip)');
    }

    return { shouldProcess };
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
