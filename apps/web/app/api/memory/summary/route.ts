import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { type MemorySummaryResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  activeMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  generateMemorySummary,
  memorySummaryFingerprint,
  readCachedMemorySummary,
  type SummarisedMemory,
} from '@/lib/services/memory-summary-service';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const MAX_SUMMARISED_MEMORIES = 200;

async function readMemories(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<SummarisedMemory[]> {
  const rows = await db.query<{ id: string; content: string; updated_at: string }>(
    `select m.id, m.content, m.updated_at::text as updated_at
       from user_memories m
      where m.user_id = $1 and ${activeMemoryPredicate('m.')}
        and ${workspaceMemoryPredicate(2, 'm.')}
      order by m.pinned desc, m.updated_at desc
      limit $3`,
    [userId, organizationId, MAX_SUMMARISED_MEMORIES],
  );
  return rows.map((row) => ({ id: row.id, content: row.content, updatedAt: row.updated_at }));
}

async function handleGetSummary(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-read');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const memories = await readMemories(db, userId, organizationId ?? null);
  const cached =
    memories.length > 0
      ? await readCachedMemorySummary(
          userId,
          memorySummaryFingerprint(memories, organizationId ?? null),
        )
      : null;

  return NextResponse.json({
    summary: cached?.summary ?? { about: [], preferences: [] },
    memoryCount: memories.length,
    generatedAt: cached?.generatedAt ?? null,
  } satisfies MemorySummaryResponse);
}

async function handleCreateSummary(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'memory-summary');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const memories = await readMemories(db, userId, organizationId ?? null);
  const planTier = await resolveEntitledPlanTier(db, userId, {
    workspaceOrganizationId: organizationId ?? null,
  });

  let result;
  try {
    result = await generateMemorySummary({
      db,
      userId,
      organizationId: organizationId ?? null,
      planTier,
      memories,
      fingerprint: memorySummaryFingerprint(memories, organizationId ?? null),
    });
  } catch (error) {
    logger.warn({ error, userId }, '[memory-summary] generation failed');
    result = null;
  }
  if (!result) {
    throw createError
      .serviceUnavailable('The summary could not be written right now. Try again in a few minutes.')
      .asUserSafe();
  }

  return NextResponse.json({
    summary: result.summary,
    memoryCount: memories.length,
    generatedAt: result.generatedAt,
  } satisfies MemorySummaryResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleGetSummary));
export const POST = withCorsRoute(withErrorHandler(handleCreateSummary));

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
