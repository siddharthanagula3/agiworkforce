/**
 * Memory Sync API
 *
 * GET /api/memory/sync - Get sync status (last sync time, entry counts by source)
 * POST /api/memory/sync - Trigger a sync (returns count and last update time)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

async function handleGetSyncStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  // Get total count and last updated timestamp
  let allMemories: { source: string | null; updated_at: string }[];
  try {
    allMemories = await db.query<{ source: string | null; updated_at: string }>(
      `select source, updated_at
       from user_memories
       where user_id = $1 and is_deleted = false
       order by updated_at desc`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get sync status');
    throw createError.internal('Failed to get sync status');
  }

  const lastSync = allMemories.length > 0 ? (allMemories[0]?.updated_at ?? null) : null;

  // Count by source
  const sources: Record<string, number> = { mobile: 0, desktop: 0, web: 0, auto: 0 };
  for (const m of allMemories) {
    const src = m.source ?? 'web';
    if (src in sources && sources[src] !== undefined) {
      sources[src]++;
    }
  }

  return NextResponse.json({
    lastSync,
    entriesCount: allMemories.length,
    sources,
  });
}

async function handleTriggerSync(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  // For now, sync is a simple count + last-update query.
  // In the future this can trigger cross-device reconciliation.
  let count: number;
  try {
    const [row] = await db.query<{ count: number }>(
      `select count(*)::int as count from user_memories where user_id = $1 and is_deleted = false`,
      [userId],
    );
    count = row?.count ?? 0;
  } catch (error) {
    logger.error({ error }, 'Failed to trigger sync');
    throw createError.internal('Failed to trigger sync');
  }

  return NextResponse.json({
    synced: count,
    conflicts: 0,
  });
}

export const GET = withErrorHandler(handleGetSyncStatus);
export const POST = withErrorHandler(handleTriggerSync);
