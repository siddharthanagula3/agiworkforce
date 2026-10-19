import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudProjectKnowledgeFileIdSchema,
  type ManagedCloudProjectKnowledgeRefreshResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { GoogleDriveFileError } from '@/lib/connectors/google-drive-files';
import { assertConnectorsReleased } from '@/lib/connectors/connector-capability';
import {
  assertDriveImportableProject,
  driveImportLimits,
  importDriveFileIntoProject,
  resolveDriveAccess,
} from '@/lib/server/project-drive-import';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

interface SourceRow {
  provider: string;
  external_id: string | null;
  version: string | null;
}

async function handleRefresh(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const { id: projectId, fileId } = await context.params;
  if (!ManagedCloudProjectKnowledgeFileIdSchema.safeParse(fileId).success) {
    throw createError.notFound('Source not found');
  }

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  assertConnectorsReleased();

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const scope = { db, userId, organizationId, projectId };
  await assertDriveImportableProject(scope);

  const [source] = await db.query<SourceRow>(
    `select ref.provider, ref.external_id, ref.version
       from project_knowledge_files file
       join external_resource_references ref on ref.id = file.external_reference_id
      where file.id = $1
        and file.project_id = $2
        and file.deleted_at is null
        and file.superseded_at is null
        and ref.user_id = $3
      limit 1`,
    [fileId, projectId, userId],
  );
  if (!source) throw createError.notFound('Source not found');
  if (source.provider !== 'google_drive' || !source.external_id) {
    throw createError.conflict('Only sources added from Google Drive can be refreshed.');
  }

  const access = await resolveDriveAccess(userId, 'refresh');
  if (access instanceof NextResponse) return access;

  try {
    const outcome = await importDriveFileIntoProject(
      scope,
      access,
      await driveImportLimits(scope),
      source.external_id,
      { skipIfVersion: source.version },
    );
    if (outcome.status === 'unchanged') {
      return NextResponse.json({
        status: 'unchanged',
      } satisfies ManagedCloudProjectKnowledgeRefreshResponse);
    }
    return NextResponse.json({
      status: 'refreshed',
      file: outcome.registration.file,
      ...(outcome.registration.notice ? { notice: outcome.registration.notice } : {}),
    } satisfies ManagedCloudProjectKnowledgeRefreshResponse);
  } catch (error) {
    if (error instanceof GoogleDriveFileError) throw createError.conflict(error.message);
    if (!isAppError(error)) {
      logger.warn({ error, projectId, fileId }, '[knowledge-files] Google Drive refresh failed');
    }
    throw error;
  }
}

export const POST = withErrorHandler(handleRefresh);
