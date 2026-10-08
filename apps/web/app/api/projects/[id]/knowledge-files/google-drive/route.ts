import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { secureFilenameSegment } from '@/lib/secure-random';
import { resolveConnectorAccessToken } from '@/lib/connectors/oauth-access';
import {
  GOOGLE_DRIVE_CONNECTOR_ID,
  GoogleDriveFileError,
  downloadGoogleDriveFile,
} from '@/lib/connectors/google-drive-files';
import { registerProjectKnowledgeFile } from '@/lib/server/project-knowledge-files';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_DRIVE_FILES_PER_REQUEST = 10;
const DRIVE_UNREACHABLE_MESSAGE = "Couldn't reach Google Drive. Try again.";

const ImportSchema = z
  .object({
    fileIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{10,200}$/),
      )
      .min(1)
      .max(MAX_DRIVE_FILES_PER_REQUEST),
  })
  .strict();

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext =
    dot >= 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      : '';
  return ext || 'bin';
}

type ImportOutcome =
  | { fileId: string; status: 'added'; file: unknown; notice?: string }
  | { fileId: string; status: 'failed'; message: string };

async function handleImport(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: projectId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsed = ImportSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation(
      `Choose between 1 and ${MAX_DRIVE_FILES_PER_REQUEST} Google Drive files to add.`,
    );
  }

  const [shared] = await db.query<{ project_id: string }>(
    `select project_id
       from public.organization_shared_projects
      where project_id = $1
        and organization_id is not distinct from $2::uuid
      limit 1`,
    [projectId, organizationId],
  );
  if (shared) {
    throw createError.conflict(
      'Google Drive files can be added only to a project that is not shared, so each person reads Drive with their own access.',
    );
  }

  const [owned] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (!owned) throw createError.notFound('Project not found');

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.capabilityUnavailable('Project sources need cloud file storage.');
  }

  const access = await resolveConnectorAccessToken(userId, GOOGLE_DRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(DRIVE_UNREACHABLE_MESSAGE).asUserSafe();
  }
  if (access.status !== 'ready') {
    return NextResponse.json(
      {
        error: {
          code:
            access.status === 'reauthorization-required'
              ? 'google_drive_reconnect_required'
              : 'google_drive_not_connected',
          message:
            access.status === 'reauthorization-required'
              ? 'Reconnect Google Drive to add files from it.'
              : 'Connect Google Drive to add files from it.',
        },
      },
      { status: 409 },
    );
  }

  const outcomes: ImportOutcome[] = [];
  for (const fileId of parsed.data.fileIds) {
    let writtenKey: string | null = null;
    try {
      const drive = await downloadGoogleDriveFile(access.accessToken, fileId, MAX_ATTACHMENT_BYTES);
      const key = `knowledge-files/projects/${projectId}/${Date.now()}_${secureFilenameSegment(13)}.${extensionOf(drive.fileName)}`;
      await putPrivateObject({
        key,
        data: drive.data,
        contentType: drive.mimeType,
        contentLength: drive.data.byteLength,
      });
      writtenKey = key;
      const registration = await registerProjectKnowledgeFile(
        { db, userId, organizationId, projectId },
        {
          fileName: drive.fileName.slice(0, 255),
          mimeType: drive.mimeType,
          byteCount: drive.data.byteLength,
          checksumSha256: createHash('sha256').update(drive.data).digest('hex'),
          sourceSurface: 'web',
          storageUri: key,
        },
        {
          kind: 'connector_item',
          provider: 'google_drive',
          uri:
            drive.webViewLink ??
            `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`,
          externalId: fileId,
          title: drive.fileName,
          version: drive.version ? { kind: 'revision', value: drive.version } : null,
          access: 'connector',
          connectorId: GOOGLE_DRIVE_CONNECTOR_ID,
          accountKey: access.accountKey,
        },
      );
      if (registration.status === 'unavailable') {
        throw createError.capabilityUnavailable('Project sources are not available yet.');
      }
      writtenKey = null;
      outcomes.push({
        fileId,
        status: 'added',
        file: registration.file,
        ...(registration.notice ? { notice: registration.notice } : {}),
      });
    } catch (error) {
      if (writtenKey) {
        await deleteProjectKnowledgeObject(writtenKey).catch((deleteError: unknown) =>
          logger.error(
            { error: deleteError, projectId, objectKey: writtenKey },
            '[knowledge-files] could not remove a Google Drive file that was not added',
          ),
        );
      }
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
