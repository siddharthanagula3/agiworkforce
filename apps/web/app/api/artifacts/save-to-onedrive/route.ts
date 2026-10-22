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
import {
  canonicalConnectorScope,
  ONEDRIVE_APP_FOLDER_SCOPE,
} from '@/lib/connectors/oauth-scope-allowlist';
import { OneDriveFileUploadError, uploadToOneDriveAppFolder } from './upload';

const ONEDRIVE_CONNECTOR_ID = 'onedrive';

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
    throw createError.validation('This file is too large to save to OneDrive from here');
  }

  const { userId } = await getUserScopedDb(request);
  const access = await resolveConnectorAccessToken(userId, ONEDRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(connectorUnreachableMessage('OneDrive')).asUserSafe();
  }
  if (access.status !== 'ready') {
    return refusal(
      access.status === 'reauthorization-required'
        ? 'onedrive_reconnect_required'
        : 'onedrive_not_connected',
    );
  }
  if (
    !access.grantedScopes.some(
      (scope) => canonicalConnectorScope(scope) === ONEDRIVE_APP_FOLDER_SCOPE,
    )
  ) {
    return refusal('onedrive_write_not_granted');
  }

  const bytes =
    parsed.data.encoding === 'base64'
      ? new Uint8Array(Buffer.from(parsed.data.content, 'base64'))
      : new TextEncoder().encode(parsed.data.content);
  try {
    const created = await uploadToOneDriveAppFolder(access, {
      name: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      bytes,
    });
    return NextResponse.json(
      {
        fileName: created.name,
        ...(created.webUrl ? { url: created.webUrl } : {}),
      } satisfies ArtifactCloudSaveResponse,
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OneDriveFileUploadError) {
      throw createError.conflict(error.message);
    }
    throw error;
  }
}

export const POST = withErrorHandler(handleSave);
