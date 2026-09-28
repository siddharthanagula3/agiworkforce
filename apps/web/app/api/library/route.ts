import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  LibraryListQuerySchema,
  type LibraryItem,
  type LibraryListResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { fileTextPreviewKind } from '@/lib/server/file-text-preview';
import {
  listLibraryAssets,
  sumLibraryStorageBytes,
  type LibraryAssetRow,
} from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

export const runtime = 'nodejs';

function headers(request: NextRequest) {
  return { ...getCorsHeaders(request), ...getSecurityHeaders() };
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

function fileNameForRow(row: LibraryAssetRow): string {
  const fromMetadata = row.metadata['filename'];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata.trim();
  const ext = EXTENSION_BY_MIME[row.mimeType.toLowerCase()];
  return ext ? `${row.kind}.${ext}` : row.kind;
}

function previewableForRow(row: LibraryAssetRow): boolean {
  const mime = row.mimeType.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf') {
    return true;
  }
  if (fileTextPreviewKind(fileNameForRow(row), row.mimeType)) return true;
  return row.metadata['previewable'] === true;
}

function toLibraryItem(row: LibraryAssetRow): LibraryItem {
  const surface = row.metadata['surface'];
  const origin = row.metadata['origin'];
  return {
    id: row.id,
    file_name: fileNameForRow(row),
    mime_type: row.mimeType,
    kind: row.kind,
    byte_count: row.byteSize,
    uri: `/api/files/${row.id}`,
    surface: surface === 'artifact' || surface === 'file' ? surface : 'file',
    previewable: previewableForRow(row),
    origin: origin === 'upload' || origin === 'uploaded' ? 'uploaded' : 'generated',
    source_surface: row.sourceSurface,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    conversation_id: row.conversationId,
  };
}

async function handleListLibrary(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  const sp = request.nextUrl.searchParams;
  const parsed = LibraryListQuerySchema.safeParse({
    kind: sp.get('kind') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    surface: sp.get('surface') ?? undefined,
    origin: sp.get('origin') ?? undefined,
    q: sp.get('q') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid query parameters');
  }
  const { kind, sort, surface, origin, q, limit, offset } = parsed.data;
  const deleted = sp.get('deleted') === 'true';

  const rows = await listLibraryAssets(
    userId,
    {
      ...(kind ? { kinds: kind } : {}),
      sort,
      surface,
      origin,
      search: q,
      deleted,
      limit: limit + 1,
      offset,
    },
    db,
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const body: LibraryListResponse = {
    items: page.map(toLibraryItem),
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
  const storageUsedBytes =
    offset === 0 && !deleted
      ? await sumLibraryStorageBytes(userId, db).catch((error: unknown) => {
          logger.warn({ error, userId }, 'Library storage total unavailable');
          return null;
        })
      : null;
  const response: LibraryListResponse = {
    ...body,
    ...(storageUsedBytes !== null ? { storage_used_bytes: storageUsedBytes } : {}),
  };
  return NextResponse.json(response, { headers: headers(request) });
}

export const GET = withErrorHandler(handleListLibrary);

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: headers(request) })
  );
}
