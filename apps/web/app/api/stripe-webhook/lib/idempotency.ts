import 'server-only';

import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';

export async function checkIdempotency(
  supabaseAdmin: SupabaseClient,
  eventId: string,
): Promise<{ shouldProcess: boolean } | { error: NextResponse }> {
  const { data: shouldProcess, error: idempotencyError } = await supabaseAdmin.rpc(
    'process_stripe_event_idempotent',
    { p_event_id: eventId },
  );

  if (idempotencyError) {
    logger.error({ eventId, error: idempotencyError }, 'Failed to check event idempotency');
    return { error: NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 }) };
  }

  if (!shouldProcess) {
    logger.warn({ eventId }, 'Stripe event already processed (idempotent skip)');
  }

  return { shouldProcess: Boolean(shouldProcess) };
}

export async function markEventSucceeded(
  supabaseAdmin: SupabaseClient,
  eventId: string,
): Promise<void> {
  try {
    await supabaseAdmin.rpc('mark_stripe_event_succeeded', { p_event_id: eventId });
  } catch (markError) {
    logger.error({ error: markError, eventId }, 'Failed to mark Stripe event as succeeded');
  }
}

export async function markEventFailed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await supabaseAdmin.rpc('mark_stripe_event_failed', {
      p_event_id: eventId,
      p_error: errorMessage,
    });
  } catch (markError) {
    logger.error({ error: markError, eventId }, 'Failed to mark Stripe event as failed');
  }
}
