import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  GOOGLE_DRIVE_KNOWLEDGE_IMPORT_MAX_FILES,
  GoogleDriveKnowledgeImportRequestSchema,
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
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

type ImportOutcome =
  | { fileId: string; status: 'added'; file: unknown; notice?: string }
  | { fileId: string; status: 'failed'; message: string };

async function handleImport(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  assertConnectorsReleased();

  const { id: projectId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsed = GoogleDriveKnowledgeImportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation(
      `Choose between 1 and ${GOOGLE_DRIVE_KNOWLEDGE_IMPORT_MAX_FILES} Google Drive files to add.`,
    );
  }

  const scope = { db, userId, organizationId, projectId };
  await assertDriveImportableProject(scope);

  const access = await resolveDriveAccess(userId, 'add');
  if (access instanceof NextResponse) return access;

  const limits = await driveImportLimits(scope);
  const outcomes: ImportOutcome[] = [];
  for (const fileId of parsed.data.fileIds) {
    try {
      const imported = await importDriveFileIntoProject(scope, access, limits, fileId);
      if (imported.status !== 'added') continue;
      outcomes.push({
        fileId,
        status: 'added',
        file: imported.registration.file,
        ...(imported.registration.notice ? { notice: imported.registration.notice } : {}),
      });
    } catch (error) {
      const message =
        error instanceof GoogleDriveFileError || isAppError(error)
          ? error.message
          : 'This file could not be added. Try again.';
      if (!(error instanceof GoogleDriveFileError) && !isAppError(error)) {
        logger.warn({ error, projectId, fileId }, '[knowledge-files] Google Drive import failed');
      }
      outcomes.push({ fileId, status: 'failed', message });
    }
  }

  const added = outcomes.filter((outcome) => outcome.status === 'added').length;
  return NextResponse.json({ results: outcomes }, { status: added > 0 ? 201 : 422 });
}

export const POST = withCorsRoute(withErrorHandler(handleImport));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
