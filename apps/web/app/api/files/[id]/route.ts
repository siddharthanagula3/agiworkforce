import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getMediaAssetById } from '@/lib/server/media-assets';
import { getObject, isObjectStorageConfigured } from '@/lib/server/object-storage';

/**
 * GET /api/files/[id] — authenticated, owner-scoped, same-origin byte serving
 * for generated files (code-interpreter outputs, generated images, CSVs, PDFs)
 * persisted in `media_assets` + R2.
 *
 * Why this exists: the chat renderers deliberately gate what they will render
 * inline — the PDF viewer accepts only `data:application/pdf`, same-origin
 * `blob:`, or a same-origin http(s)/relative URL; images accept data:/blob:/
 * same-origin. The raw R2 public URL is cross-origin, so bytes stored there
 * are downloadable but never inline-renderable. This route re-serves the
 * stored bytes from the app's own origin so those gates accept them.
 *
 * Contract (also consumed by mobile/desktop cloud surfaces later):
 *   GET /api/files/{mediaAssetId}
 *   Auth: Clerk session cookie (browser) or `Authorization: Bearer <jwt>`
 *         (mobile/desktop/CLI) — same dual path as every other API route.
 *   200: raw bytes; Content-Type from the asset row; Content-Disposition
 *        inline with the original filename; Cache-Control private.
 *   401: unauthenticated · 403: asset belongs to another user ·
 *   404: unknown/deleted asset · 413: asset exceeds the serve cap.
 */

type RouteContext = { params: Promise<{ id: string }> };

/** Serve cap — matches the harvest-side cap plus headroom; nothing bigger is
 * ever persisted by the generated-file pipelines (20MB per-file harvest cap). */
const MAX_SERVE_BYTES = 30 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 6266 filename sanitization: keep a conservative ASCII subset. */
function safeFilename(name: unknown): string {
  const raw = typeof name === 'string' && name.trim() ? name.trim() : 'file';
  return raw.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 128);
}

async function handleGetFile(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { id } = await context.params;

  if (!UUID_RE.test(id)) {
    throw createError.notFound('File not found');
  }

  const asset = await getMediaAssetById(id);
  if (!asset || asset.deletedAt) {
    throw createError.notFound('File not found');
  }
  if (asset.userId !== userId) {
    // Owner-scoped: generated files are never shared cross-user through this
    // route. (Sharing flows have their own explicit share endpoints.)
    throw createError.forbidden('You do not have access to this file');
  }

  if (asset.byteSize != null && asset.byteSize > MAX_SERVE_BYTES) {
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the inline serving limit' } },
      { status: 413 },
    );
  }

  if (!isObjectStorageConfigured() || !asset.storagePathname) {
    // No byte source we can proxy — honest 404 rather than a redirect to a
    // cross-origin URL the renderer gates would reject anyway.
    throw createError.notFound('File bytes are not available');
  }

  const object = await getObject(asset.storagePathname);
  if (!object) {
    throw createError.notFound('File bytes are not available');
  }
  if (object.data.byteLength > MAX_SERVE_BYTES) {
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the inline serving limit' } },
      { status: 413 },
    );
  }

  const filename = safeFilename(asset.metadata['filename']);
  const body = new Uint8Array(object.data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType || object.contentType || 'application/octet-stream',
      'Content-Length': String(object.data.byteLength),
      'Content-Disposition': `inline; filename="${filename}"`,
      // Private: bytes are owner-scoped; never let a shared cache hold them.
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = withErrorHandler(handleGetFile);
