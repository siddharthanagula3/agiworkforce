import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getPresignedUploadUrl, isObjectStorageConfigured } from '@/lib/server/object-storage';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { secureFilenameSegment } from '@/lib/secure-random';
import { randomUUID } from 'node:crypto';
import { isSupportedChatAttachment, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';

/**
 * Presigned-upload API · client code never imports the R2/S3 SDK or holds
 * credentials. It asks this route for a short-lived PUT URL, uploads bytes
 * directly to R2 via `fetch`, then registers the resulting public URL with
 * the owning resource (profile avatar or project knowledge file).
 *
 * A server proxy route can't be used here: Vercel serverless functions cap
 * request bodies at ~4.5MB, well under the knowledge-file size cap, so the
 * browser must PUT directly to R2.
 *
 * Chat attachments use the same direct-to-R2 boundary, then call the
 * owner-scoped completion route to verify bytes and register media metadata.
 */

const PresignRequestSchema = z.object({
  kind: z.enum(['avatar', 'knowledge-file', 'chat-attachment']),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive(),
  projectId: z.string().min(1).max(200).optional(),
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
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isObjectStorageConfigured()) {
    throw createError.internal('Object storage is not configured');
  }

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => null);
  const parsed = PresignRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const { kind, fileName, mimeType, byteCount, projectId } = parsed.data;

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
    const [project] = await db.query<{ id: string }>(
      `select id from user_projects where id = $1 and user_id = $2 limit 1`,
      [projectId, userId],
    );
    if (!project) {
      throw createError.notFound('Project not found');
    }
    key = `knowledge-files/projects/${projectId}/${suffix}`;
  } else {
    key = `chat-attachments/${userId}/${suffix}`;
  }

  const { uploadUrl, publicUrl } = await getPresignedUploadUrl({
    key,
    contentType: mimeType,
    expiresInSeconds: 300,
  });

  return NextResponse.json({
    attachmentId: randomUUID(),
    storageKey: key,
    uploadUrl,
    uploadMethod: 'PUT' as const,
    uploadHeaders: { 'Content-Type': mimeType },
    publicUrl,
    expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
  });
}

export const POST = withErrorHandler(handlePresign);
