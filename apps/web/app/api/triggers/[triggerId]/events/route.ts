import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { rethrowTriggerError } from '@/lib/triggers/trigger-errors';
import { listTriggerDeliveries } from '@/lib/triggers/trigger-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

async function handleListDeliveries(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { triggerId } = await context.params;
  if (!UUID_RE.test(triggerId)) throw createError.validation('triggerId must be a uuid');

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, integerQueryValue(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE)),
  );
  const offset = Math.max(0, integerQueryValue(url.searchParams.get('offset'), 0));
  try {
    const events = await listTriggerDeliveries(db, userId, triggerId, { limit, offset });
    return NextResponse.json({ events, pagination: { limit, offset } });
  } catch (error) {
    rethrowTriggerError(error);
  }
}

export const GET = withErrorHandler(handleListDeliveries);
