import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ARTIFACT_CLOUD_SAVE_MAX_BYTES,
  ARTIFACT_CLOUD_SAVE_REFUSALS,
  ArtifactCloudSaveRequestSchema,
  artifactCloudSaveByteLength,
  type ArtifactCloudSaveRefusalCode,
  type ArtifactCloudSaveResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { assertConnectorsReleased } from '@/lib/connectors/connector-capability';
import {
  connectorUnreachableMessage,
  resolveConnectorAccessToken,
} from '@/lib/connectors/oauth-access';
import { GOOGLE_DRIVE_CONNECTOR_ID } from '@/lib/connectors/google-drive-files';
import { canCreateDriveFiles } from '@/lib/connectors/google-docs-export';
import { DriveFileUploadError, uploadDriveFile } from './upload';

export const runtime = 'nodejs';

function refusal(code: ArtifactCloudSaveRefusalCode): NextResponse {
  return NextResponse.json(
    { error: { code, message: ARTIFACT_CLOUD_SAVE_REFUSALS[code] } },
    { status: 409 },
  );
}

async function handleSave(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;
  assertConnectorsReleased();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = ArtifactCloudSaveRequestSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid file');
  if (artifactCloudSaveByteLength(parsed.data) > ARTIFACT_CLOUD_SAVE_MAX_BYTES) {
    throw createError.validation('This file is too large to save to Google Drive from here');
  }

  const { userId } = await getUserScopedDb(request);
  const access = await resolveConnectorAccessToken(userId, GOOGLE_DRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(connectorUnreachableMessage('Google Drive')).asUserSafe();
  }
  if (access.status !== 'ready') {
    return refusal(
      access.status === 'reauthorization-required'
        ? 'google_drive_reconnect_required'
        : 'google_drive_not_connected',
    );
  }
  if (!canCreateDriveFiles(access.grantedScopes)) {
    return refusal('google_drive_write_not_granted');
  }

  const bytes =
    parsed.data.encoding === 'base64'
      ? new Uint8Array(Buffer.from(parsed.data.content, 'base64'))
      : new TextEncoder().encode(parsed.data.content);
  try {
    const created = await uploadDriveFile(access.accessToken, {
      name: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      bytes,
    });
    return NextResponse.json(
      {
        fileName: parsed.data.fileName,
        ...(created.webViewLink ? { url: created.webViewLink } : {}),
      } satisfies ArtifactCloudSaveResponse,
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DriveFileUploadError) {
      throw createError.conflict(error.message);
    }
    throw error;
  }
}

export const POST = withErrorHandler(handleSave);
