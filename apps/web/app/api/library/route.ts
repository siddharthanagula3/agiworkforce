import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  LibraryListQuerySchema,
  type LibraryItem,
  type LibraryListResponse,
} from '@agiworkforce/services';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { listLibraryAssets, type LibraryAssetRow } from '@/lib/server/media-assets';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

/**
 * GET /api/library — the user-scoped Library listing over `media_assets`
 * (generated images, code-interpreter outputs, document deliverables) that
 * powers the web `/library` page. Contract: `LibraryListResponseSchema` in
 * `@agiworkforce/services` cloud-contracts.
 *
 * Auth: Clerk session cookie (browser) or `Authorization: Bearer <jwt>`
 * (desktop/mobile cloud later) — same dual path as sibling API routes.
 * Owner-scoped: only the authenticated user's rows are listed; bytes are
 * served exclusively through the authed `/api/files/{id}` route (no public
 * URLs are minted here).
 *
 * Filters: kind (image|video|file), surface (artifact|file — LEGACY rows
 * without persisted metadata.surface fold to 'file'), origin
 * (generated|uploaded, derived from metadata.origin), q (filename/prompt
 * ILIKE). Offset pagination with a limit+1 probe, matching
 * `/api/chat/conversations`.
 */

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

/**
 * Display filename: the persisted `metadata.filename` when the writer
 * recorded one (all generated-file pipelines do). LEGACY image-generation
 * rows have empty metadata — fall back to a kind-derived name so the UI
 * never shows a blank title, without inventing provenance.
 */
function fileNameForRow(row: LibraryAssetRow): string {
  const fromMetadata = row.metadata['filename'];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata.trim();
  const ext = EXTENSION_BY_MIME[row.mimeType.toLowerCase()];
  return ext ? `${row.kind}.${ext}` : row.kind;
}

/**
 * Inline-render affordance: the persisted Wave A `metadata.previewable` when
 * present; LEGACY rows fall back to mime-derived (image/* → true), the same
 * rule `classifyGeneratedFile` applies at persistence time.
 */
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
    // Legacy fallback documented in the contract: missing surface → 'file'.
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

  const { userId } = await getClerkAuthUser(request);

  const sp = request.nextUrl.searchParams;
  const parsed = LibraryListQuerySchema.safeParse({
    kind: sp.get('kind') ?? undefined,
    surface: sp.get('surface') ?? undefined,
    origin: sp.get('origin') ?? undefined,
    q: sp.get('q') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid query parameters');
  }
  const { kind, surface, origin, q, limit, offset } = parsed.data;

  // limit+1 probe: fetch one extra row to learn whether another page exists
  // without a COUNT(*) (matches /api/chat/conversations).
  const rows = await listLibraryAssets(userId, {
    kind,
    surface,
    origin,
    search: q,
    limit: limit + 1,
    offset,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const body: LibraryListResponse = {
    items: page.map(toLibraryItem),
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
  return NextResponse.json(body, { headers: headers(request) });
}

export const GET = withErrorHandler(handleListLibrary);

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: headers(request) })
  );
}
