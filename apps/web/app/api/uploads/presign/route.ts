import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getPresignedPrivateUploadUrl,
  getPresignedUploadUrl,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
} from '@/lib/server/object-storage';
import {
  createLocalProjectKnowledgeUploadUrl,
  deleteProjectKnowledgeObject,
  isProjectKnowledgeObjectStorageConfigured,
} from '@/lib/server/project-knowledge-object-storage';
import {
  IMAGE_ATTACHMENT_MIME_TYPES,
  MAX_AVATAR_BYTES,
  validateAttachmentMeta,
} from '@agiworkforce/types';
import { secureFilenameSegment } from '@/lib/secure-random';
import { randomUUID } from 'node:crypto';
import { isSupportedChatAttachment, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

const PresignRequestSchema = z.object({
  kind: z.enum(['avatar', 'knowledge-file', 'chat-attachment']),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive(),
  projectId: z.string().min(1).max(200).optional(),
});
const CleanupRequestSchema = z.object({
  kind: z.literal('knowledge-file'),
  projectId: z.string().min(1).max(200),
  storageKey: z
    .string()
    .min(1)
    .max(1_000)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
});


function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0
    ? name
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'bin'
    : 'bin';
}

async function handlePresign(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = PresignRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const { kind, fileName, mimeType, byteCount, projectId } = parsed.data;

  const storageConfigured =
    kind === 'chat-attachment'
      ? isPrivateObjectStorageConfigured()
      : kind === 'knowledge-file'
        ? isProjectKnowledgeObjectStorageConfigured()
        : isObjectStorageConfigured();
  if (!storageConfigured) {
    throw createError.internal('Object storage is not configured');
  }

  const validation = validateAttachmentMeta(fileName, mimeType, byteCount);
  if (!validation.ok) {
    throw createError.validation(validation.message);
  }
  if (kind === 'chat-attachment') {
    if (byteCount > MAX_CHAT_ATTACHMENT_BYTES) {
      throw createError.validation('Chat attachments are limited to 12 MiB.');
    }
    if (!isSupportedChatAttachment(fileName, mimeType)) {
      throw createError.validation(
        'Chat supports images, PDFs, and text/code files. Convert Office files to PDF first.',
      );
    }
  } else if (kind === 'avatar') {
    if (byteCount > MAX_AVATAR_BYTES) {
      throw createError.validation(
        `Avatars are limited to ${MAX_AVATAR_BYTES / (1024 * 1024)} MiB.`,
      );
    }
    const avatarMime = mimeType.split(';', 1)[0]!.trim().toLowerCase();
    if (!IMAGE_ATTACHMENT_MIME_TYPES.includes(avatarMime)) {
      throw createError.validation('Avatars must be a PNG, JPEG, GIF, WebP, or HEIC image.');
    }
  }

  const ext = extOf(fileName);
  const suffix = `${Date.now()}_${secureFilenameSegment(13)}.${ext}`;

  let key: string;
  if (kind === 'avatar') {
    key = `avatars/${userId}/${suffix}`;
  } else if (kind === 'knowledge-file') {
    if (!projectId) {
      throw createError.validation('projectId is required for knowledge-file uploads');
    }
    const db = getNeonDb();
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const [project] = await db.query<{ id: string }>(
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
    if (!project) {
      throw createError.notFound('Project not found');
    }
    key = `knowledge-files/projects/${projectId}/${suffix}`;
  } else {
    key = `chat-attachments/${userId}/${suffix}`;
  }

  const localKnowledgeUpload = kind === 'knowledge-file' && !isPrivateObjectStorageConfigured();
  const upload = localKnowledgeUpload
    ? {
        uploadUrl: new URL(
          await createLocalProjectKnowledgeUploadUrl({
            userId,
            key,
            contentType: mimeType,
            byteCount,
          }),
          request.nextUrl.origin,
        ).toString(),
      }
    : kind === 'chat-attachment' || kind === 'knowledge-file'
      ? await getPresignedPrivateUploadUrl({
          key,
          contentType: mimeType,
          contentLength: byteCount,
          expiresInSeconds: 300,
        })
      : await getPresignedUploadUrl({
          key,
          contentType: mimeType,
          contentLength: byteCount,
          expiresInSeconds: 300,
        });

  return NextResponse.json({
    attachmentId: randomUUID(),
    storageKey: key,
    uploadUrl: upload.uploadUrl,
    uploadMethod: 'PUT' as const,
    uploadHeaders: { 'Content-Type': mimeType },
    ...('publicUrl' in upload ? { publicUrl: upload.publicUrl } : {}),
    expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
  });
}

async function handleCleanup(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = CleanupRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.validation('Invalid upload cleanup request');
  const { projectId, storageKey } = parsed.data;
  const expectedPrefix = `knowledge-files/projects/${projectId}/`;
  if (
    !storageKey.startsWith(expectedPrefix) ||
    storageKey.includes('//') ||
    storageKey.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw createError.validation('Invalid project upload key');
  }

  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);
  const [project] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (!project) throw createError.notFound('Project not found');
  await deleteProjectKnowledgeObject(storageKey);
  return NextResponse.json({ success: true });
}

export const POST = withCorsRoute(withErrorHandler(handlePresign));
export const DELETE = withCorsRoute(withErrorHandler(handleCleanup));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
