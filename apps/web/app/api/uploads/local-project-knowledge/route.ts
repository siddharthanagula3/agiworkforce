import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withRateLimit } from '@/lib/rate-limit';
import { storeLocalProjectKnowledgeUpload } from '@/lib/server/project-knowledge-object-storage';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';

async function readBoundedUpload(request: NextRequest): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES) {
    throw createError.validation('Project sources are limited to 25 MiB.');
  }
  if (!request.body) throw createError.validation('The local upload body is missing.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ATTACHMENT_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw createError.validation('Project sources are limited to 25 MiB.');
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

async function handleLocalProjectKnowledgeUpload(request: NextRequest): Promise<NextResponse> {
  if (process.env['NODE_ENV'] !== 'development') throw createError.notFound('Not found');
  const { userId } = await getClerkAuthUser(request);
  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  const token = request.nextUrl.searchParams.get('token');
  const contentType = request.headers.get('content-type');
  if (!token || !contentType) throw createError.validation('Invalid local upload request');

  const data = await readBoundedUpload(request);
  try {
    await storeLocalProjectKnowledgeUpload({ token, userId, contentType, data });
  } catch (error) {
    throw createError.validation(
      error instanceof Error ? error.message : 'Invalid local upload request',
    );
  }
  return new NextResponse(null, { status: 204 });
}

export const PUT = withErrorHandler(handleLocalProjectKnowledgeUpload);
