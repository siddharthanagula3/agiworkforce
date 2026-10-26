import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { chatAttachmentSizeLabel, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { verifyChatAttachmentRelayUpload } from '@/lib/server/chat-attachment-completion';

const CHAT_ATTACHMENT_SIZE_LIMIT_MESSAGE = `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_BYTES)} each.`;

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Object storage is not configured');
  }

  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    throw createError.forbidden('This upload is not authorized');
  }

  const contentLengthHeader = request.headers.get('content-length');
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  if (declaredLength !== undefined && declaredLength > MAX_CHAT_ATTACHMENT_BYTES) {
    throw createError.validation(CHAT_ATTACHMENT_SIZE_LIMIT_MESSAGE);
  }

  const contentType = request.headers.get('content-type')?.trim() || 'application/octet-stream';
  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0) {
    throw createError.validation('The uploaded file was empty.');
  }
  if (body.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
    throw createError.validation(CHAT_ATTACHMENT_SIZE_LIMIT_MESSAGE);
  }

  let key: string;
  try {
    key = (
      await verifyChatAttachmentRelayUpload(token, userId, {
        contentType,
        byteLength: body.byteLength,
      })
    ).key;
  } catch (error) {
    throw createError.forbidden(
      error instanceof Error ? error.message : 'This upload is not authorized',
    );
  }

  await putPrivateObject({
    key,
    data: body,
    contentType,
    contentLength: body.byteLength,
  });

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handlePut);
