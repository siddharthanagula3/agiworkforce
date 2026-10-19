import 'server-only';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  admitAttachmentUpload,
  attachmentLimitBytes,
  attachmentSizeRefusal,
} from '@/lib/server/attachment-allowance';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { secureFilenameSegment } from '@/lib/secure-random';
import {
  connectorUnreachableMessage,
  resolveConnectorAccessToken,
} from '@/lib/connectors/oauth-access';
import {
  GOOGLE_DRIVE_CONNECTOR_ID,
  downloadGoogleDriveFile,
} from '@/lib/connectors/google-drive-files';
import {
  registerProjectKnowledgeFile,
  type ProjectKnowledgeScope,
} from '@/lib/server/project-knowledge-files';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';

export interface DriveAccess {
  accessToken: string;
  accountKey: string;
}

export interface DriveImportLimits {
  maxBytes: number;
  tooLargeMessage: string | undefined;
}

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

export async function assertDriveImportableProject(scope: ProjectKnowledgeScope): Promise<void> {
  const { db, userId, organizationId, projectId } = scope;
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
}

export async function resolveDriveAccess(
  userId: string,
  action: 'add' | 'refresh',
): Promise<DriveAccess | NextResponse> {
  const access = await resolveConnectorAccessToken(userId, GOOGLE_DRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(connectorUnreachableMessage('Google Drive')).asUserSafe();
  }
  if (access.status !== 'ready') {
    const verb = action === 'add' ? 'add files from it' : 'refresh files from it';
    return NextResponse.json(
      {
        error: {
          code:
            access.status === 'reauthorization-required'
              ? 'google_drive_reconnect_required'
              : 'google_drive_not_connected',
          message:
            access.status === 'reauthorization-required'
              ? `Reconnect Google Drive to ${verb}.`
              : `Connect Google Drive to ${verb}.`,
        },
      },
      { status: 409 },
    );
  }
  return { accessToken: access.accessToken, accountKey: access.accountKey };
}

export async function driveImportLimits(scope: ProjectKnowledgeScope): Promise<DriveImportLimits> {
  const planTier = await resolveEntitledPlanTier(scope.db, scope.userId, {
    workspaceOrganizationId: scope.organizationId,
  });
  const maxBytes = attachmentLimitBytes(planTier, 'knowledge-file');
  const tooLarge = attachmentSizeRefusal(planTier, 'knowledge-file', maxBytes + 1);
  return { maxBytes, tooLargeMessage: tooLarge ? `is too large. ${tooLarge.message}` : undefined };
}

export async function importDriveFileIntoProject(
  scope: ProjectKnowledgeScope,
  access: DriveAccess,
  limits: DriveImportLimits,
  fileId: string,
  options: { skipIfVersion?: string | null } = {},
): Promise<
  | { status: 'unchanged' }
  | { status: 'added'; registration: Awaited<ReturnType<typeof registerProjectKnowledgeFile>> }
> {
  const { db, userId, organizationId, projectId } = scope;
  const drive = await downloadGoogleDriveFile(
    access.accessToken,
    fileId,
    limits.maxBytes,
    limits.tooLargeMessage,
  );
  if (options.skipIfVersion && drive.version && drive.version === options.skipIfVersion) {
    return { status: 'unchanged' };
  }
  await admitAttachmentUpload({
    db,
    userId,
    organizationId,
    kind: 'knowledge-file',
    byteCount: drive.data.byteLength,
  });
  const key = `knowledge-files/projects/${projectId}/${Date.now()}_${secureFilenameSegment(13)}.${extensionOf(drive.fileName)}`;
  await putPrivateObject({
    key,
    data: drive.data,
    contentType: drive.mimeType,
    contentLength: drive.data.byteLength,
  });
  try {
    const registration = await registerProjectKnowledgeFile(
      scope,
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
          drive.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`,
        externalId: fileId,
        title: drive.fileName,
        version: drive.version ? { kind: 'revision', value: drive.version } : null,
        access: 'connector',
        connectorId: GOOGLE_DRIVE_CONNECTOR_ID,
        accountKey: access.accountKey,
      },
    );
    return { status: 'added', registration };
  } catch (error) {
    await deleteProjectKnowledgeObject(key).catch((deleteError: unknown) =>
      logger.error(
        { error: deleteError, projectId, objectKey: key },
        '[knowledge-files] could not remove a Google Drive file that was not added',
      ),
    );
    throw error;
  }
}
