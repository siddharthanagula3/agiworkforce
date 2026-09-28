import 'server-only';

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import {
  LibraryListQuerySchema,
  type LibraryItem,
  type LibraryListResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { listLibraryAssets, type LibraryAssetRow } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { persistGeneratedFileBytes } from '@/lib/server/generated-file-persist';

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
  const persisted = row.metadata['previewable'];
  if (typeof persisted === 'boolean') return persisted;
  return row.mimeType.toLowerCase().startsWith('image/');
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
  return NextResponse.json(body, { headers: headers(request) });
}

const MAX_SAVED_ARTIFACT_CHARS = 1_000_000;

const SaveArtifactSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    content: z.string().min(1).max(MAX_SAVED_ARTIFACT_CHARS),
    conversationId: z.string().uuid().optional(),
  })
  .strict();

const SAVED_ARTIFACT_MIME_BY_EXTENSION: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
};

async function handleSaveArtifact(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = SaveArtifactSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Choose an artifact to save');

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const extension = parsed.data.fileName.toLowerCase().split('.').pop() ?? '';
  const outcome = await persistGeneratedFileBytes(
    {
      userId,
      organizationId,
      data: Buffer.from(parsed.data.content, 'utf8'),
      mimeType: SAVED_ARTIFACT_MIME_BY_EXTENSION[extension] ?? 'text/plain',
      filename: parsed.data.fileName,
      provider: 'artifact',
      origin: 'saved_artifact',
      ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
    },
    db,
  );
  if (!outcome.ok) {
    if (outcome.reason === 'too_large') {
      throw createError.validation('This artifact is too large to save to your Library.');
    }
    throw createError
      .serviceUnavailable('Your Library could not store this artifact. Nothing was saved.')
      .asUserSafe();
  }
  return NextResponse.json({ id: outcome.file.id }, { status: 201, headers: headers(request) });
}

export const GET = withErrorHandler(handleListLibrary);
export const POST = withErrorHandler(handleSaveArtifact);

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: headers(request) })
  );
}
