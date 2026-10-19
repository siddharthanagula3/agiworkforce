import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudProjectKnowledgeOriginsResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';

type RouteContext = { params: Promise<{ id: string }> };

interface OriginRow {
  file_id: string;
  provider: string;
  uri: string;
  version: string | null;
  last_seen_at: string | Date;
}

async function handleList(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const { id: projectId } = await context.params;
  const { db, userId } = await getUserScopedDb(request);
  const rows = await db.query<OriginRow>(
    `select file.id as file_id, ref.provider, ref.uri, ref.version, ref.last_seen_at
       from project_knowledge_files file
       join external_resource_references ref on ref.id = file.external_reference_id
      where file.project_id = $1
        and file.deleted_at is null
        and file.superseded_at is null
        and ref.user_id = $2`,
    [projectId, userId],
  );
  const body: ManagedCloudProjectKnowledgeOriginsResponse = {
    origins: rows.map((row) => ({
      fileId: row.file_id,
      provider: row.provider,
      uri: row.uri,
      refreshable: row.provider === 'google_drive',
      checkedAt:
        row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : new Date(row.last_seen_at).toISOString(),
    })),
  };
  return NextResponse.json(body);
}

export const GET = withErrorHandler(handleList);
