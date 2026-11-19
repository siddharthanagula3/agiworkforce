import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { LibraryThumbnailPathParamsSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getActiveWorkspaceMediaAssetById } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMediaStorageConfigured, streamStoredMedia } from '@/lib/server/media-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { recordEgressBytes } from '@/lib/services/infrastructure-cost';
import { resolveProductAnalyticsSurface } from '@/lib/server/product-analytics';
import {
  aiGeneratedHeaders,
  hasAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';
import {
  hasLibraryThumbnail,
  LIBRARY_THUMBNAIL_CONTENT_TYPE,
  LIBRARY_THUMBNAIL_SOURCE_MAX_BYTES,
  renderLibraryThumbnail,
} from '@/lib/server/library-thumbnail';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function readStoredBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

async function handleGetThumbnail(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const params = LibraryThumbnailPathParamsSchema.safeParse(await context.params);
  if (!params.success) throw createError.notFound('File not found');
  const { id } = params.data;

  const asset = await getActiveWorkspaceMediaAssetById(userId, id, db, { organizationId });
  if (!asset || asset.deletedAt) throw createError.notFound('File not found');
  if (!hasLibraryThumbnail(asset)) throw createError.notFound('Thumbnail not available');
  if (!isMediaStorageConfigured() || !asset.storagePathname) {
    throw createError.notFound('File bytes are not available');
  }

  const streamed = await streamStoredMedia(asset.storagePathname);
  if (!streamed) throw createError.notFound('File bytes are not available');
  if (streamed.contentLength > LIBRARY_THUMBNAIL_SOURCE_MAX_BYTES) {
    await streamed.body.cancel().catch(() => undefined);
    throw createError.notFound('Thumbnail not available');
  }
  const source = await readStoredBytes(streamed.body, LIBRARY_THUMBNAIL_SOURCE_MAX_BYTES);
  if (!source) throw createError.notFound('Thumbnail not available');

  let thumbnail: Buffer;
  try {
    thumbnail = await renderLibraryThumbnail(source);
  } catch {
    throw createError.notFound('Thumbnail not available');
  }

  recordEgressBytes({
    userId,
    bytes: thumbnail.byteLength,
    surface: resolveProductAnalyticsSurface(request),
    provider: 'object_storage',
    downloadAllowanceExempt: true,
  });

  const claim = asset.metadata['aiAct'];
  return new NextResponse(new Uint8Array(thumbnail), {
    status: 200,
    headers: {
      'Content-Type': LIBRARY_THUMBNAIL_CONTENT_TYPE,
      'Content-Length': String(thumbnail.byteLength),
      'Content-Disposition': 'inline',
      ...(hasAiGeneratedProvenance(claim)
        ? aiGeneratedHeaders(claim as AiGeneratedProvenance)
        : {}),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGetThumbnail));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
