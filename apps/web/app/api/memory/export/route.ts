import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import type { ManagedMemoryRecord } from '@agiworkforce/types';
import {
  activeMemoryPredicate,
  workspaceMemoryPredicate,
} from '@/lib/services/managed-memory-context-service';

const EXPORT_BATCH_SIZE = 1000;
const MAX_EXPORTED_MEMORIES = 50_000;
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

interface ExportRow {
  id: string;
  content: string;
  category: string | null;
  source: string | null;
  pinned: boolean;
  project_id: string | null;
  project_name: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function toExported(row: ExportRow): ManagedMemoryRecord {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    source: row.source,
    pinned: row.pinned,
    projectId: row.project_id,
    projectName: row.project_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memoryExportFilename(now: Date): string {
  return `memories-${now.toISOString().slice(0, 10)}.json`;
}

async function handleExport(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-read');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const exported: ManagedMemoryRecord[] = [];
  let afterId = FIRST_ID;
  for (;;) {
    let rows: ExportRow[];
    try {
      rows = await db.query<ExportRow>(
        `select m.id::text as id, m.content, m.category, m.source, m.pinned,
                m.project_id::text as project_id, p.name as project_name,
                m.expires_at, m.created_at, m.updated_at
           from user_memories m
           left join user_projects p
             on p.id = m.project_id
            and p.deleted_at is null
          where m.user_id = $1 and ${activeMemoryPredicate('m.')}
            and ${workspaceMemoryPredicate(2, 'm.')}
            and m.id > $3::uuid
          order by m.id
          limit $4`,
        [userId, organizationId ?? null, afterId, EXPORT_BATCH_SIZE],
      );
    } catch (error) {
      logger.error({ error, userId }, '[memory-export] read failed');
      throw createError.internal('Failed to export memories');
    }
    for (const row of rows) exported.push(toExported(row));
    if (exported.length > MAX_EXPORTED_MEMORIES) {
      throw createError
        .payloadTooLarge(
          `You have more than ${MAX_EXPORTED_MEMORIES.toLocaleString('en-US')} memories, which is more than one export can hold. Delete some and try again.`,
        )
        .asUserSafe();
    }
    if (rows.length < EXPORT_BATCH_SIZE) break;
    afterId = rows[rows.length - 1]!.id;
  }

  return new NextResponse(JSON.stringify(exported, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${memoryExportFilename(new Date())}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleExport));

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
