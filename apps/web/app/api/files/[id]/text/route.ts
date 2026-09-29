import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { FileTextPreview } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getActiveWorkspaceMediaAssetById } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMediaStorageConfigured, readStoredMedia } from '@/lib/server/media-storage';
import { fileTextPreviewKind, renderFileTextPreview } from '@/lib/server/file-text-preview';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TEXT_SOURCE_BYTES = 30 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGetFileText(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const { id } = await context.params;
  if (!UUID_RE.test(id)) throw createError.notFound('File not found');

  const asset = await getActiveWorkspaceMediaAssetById(userId, id, db);
  if (!asset || asset.deletedAt) throw createError.notFound('File not found');

  const rawName = asset.metadata['filename'];
  const fileName = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : asset.kind;
  const kind = fileTextPreviewKind(fileName, asset.mimeType);
  if (!kind) throw createError.notFound('This file has no text preview');
  if (asset.byteSize != null && asset.byteSize > MAX_TEXT_SOURCE_BYTES) {
    throw createError.validation('This file is too large to preview');
  }
  if (!isMediaStorageConfigured() || !asset.storagePathname) {
    throw createError.notFound('File bytes are not available');
  }

  const object = await readStoredMedia(asset.storagePathname);
  if (!object) throw createError.notFound('File bytes are not available');

  return NextResponse.json<FileTextPreview>(
    { ...(await renderFileTextPreview(kind, fileName, asset.mimeType, object.data)), fileName },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGetFileText));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
