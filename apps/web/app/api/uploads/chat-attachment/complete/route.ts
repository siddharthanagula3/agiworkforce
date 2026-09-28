import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveProductAnalyticsSurface } from '@/lib/server/product-analytics';
import {
  completeChatAttachmentUpload,
  resolveUploadSourceSurface,
} from '@/lib/server/chat-attachment-completion';

const CompleteChatAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
  conversationId: z.string().min(1).max(200).optional(),
  temporary: z.boolean().optional(),
});

async function handleComplete(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Private object storage is not configured');
  }

  const parsed = CompleteChatAttachmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }

  const attachment = await completeChatAttachmentUpload({
    db,
    userId,
    organizationId,
    sourceSurface: resolveUploadSourceSurface(request),
    analyticsSurface: resolveProductAnalyticsSurface(request),
    ...parsed.data,
  });
  return NextResponse.json({ attachment });
}

export const POST = withCorsRoute(withErrorHandler(handleComplete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
