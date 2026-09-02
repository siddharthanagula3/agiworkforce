import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';

const CHAT_ATTACHMENT_SIZE_LIMIT_MESSAGE = 'Chat attachments are limited to 12 MiB.';

function isOwnedChatAttachmentKey(key: string, userId: string): boolean {
  const prefix = `chat-attachments/${userId}/`;
  return (
    key.startsWith(prefix) &&
    key.length > prefix.length &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) &&
    !key.includes('//') &&
    !key.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Object storage is not configured');
  }

  const key = request.nextUrl.searchParams.get('key') ?? '';
  if (!isOwnedChatAttachmentKey(key, userId)) {
    throw createError.forbidden('Invalid upload destination');
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

  await putPrivateObject({
    key,
    data: body,
    contentType,
    contentLength: body.byteLength,
  });

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handlePut);
