import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  MAX_FEED_LIMIT,
  listNotifications,
  markNotificationsRead,
} from '@/lib/services/notification-service';

export const runtime = 'nodejs';

const RATE_LIMIT_BUCKET = 'notifications';

const FEED_SCOPE = { resolveOrganization: false } as const;

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  unread: z.enum(['true', 'false']).optional(),
});

const MAX_IDS_PER_REQUEST = MAX_FEED_LIMIT;

const MarkReadSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_IDS_PER_REQUEST) }).strict(),
]);

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const search = request.nextUrl.searchParams;
  const parsed = ListQuerySchema.safeParse({
    limit: search.get('limit') ?? undefined,
    before: search.get('before') ?? undefined,
    unread: search.get('unread') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.badRequest('Invalid notification query', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request, FEED_SCOPE);
  const feed = await listNotifications(db, userId, {
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    before: parsed.data.before ?? null,
    unreadOnly: parsed.data.unread === 'true',
  });

  return NextResponse.json(feed, { headers: NO_STORE });
}

async function handleMarkRead(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, FEED_SCOPE);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = MarkReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid notification selection', parsed.error.flatten());
  }

  const updated = await markNotificationsRead(
    db,
    userId,
    'all' in parsed.data ? { all: true } : { ids: parsed.data.ids },
  );

  return NextResponse.json({ updated }, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleList);
export const PATCH = withErrorHandler(handleMarkRead);
