import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudChatAttachmentCompleteRequestSchema,
  type ManagedCloudChatAttachmentCompleteResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveProductAnalyticsSurface } from '@/lib/server/product-analytics';
import {
  completeChatAttachmentUpload,
  resolveUploadSourceSurface,
} from '@/lib/server/chat-attachment-completion';

async function handleComplete(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Private object storage is not configured');
  }

  const parsed = ManagedCloudChatAttachmentCompleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
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
  const completed: ManagedCloudChatAttachmentCompleteResponse = { attachment };
  return NextResponse.json(completed);
}

export const POST = withCorsRoute(withErrorHandler(handleComplete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
