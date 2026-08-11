import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getActiveWorkspaceMediaAssetById } from '@/lib/server/media-assets';
import {
  isMediaStorageConfigured,
  readStoredMedia,
  streamStoredMedia,
} from '@/lib/server/media-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import {
  aiGeneratedHeaders,
  hasAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

/**
 * GET /api/files/[id] — authenticated, owner-scoped, same-origin byte serving
 * for generated files (code-interpreter outputs, generated images, CSVs, PDFs)
 * persisted in `media_assets` plus R2 in production or local development
 * media storage.
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
 *   200: raw bytes; Content-Type from the asset row and an inline
 *        Content-Disposition carrying the original filename — EXCEPT for types
 *        a browser executes as a document (html/svg/xml), which are demoted to
 *        `application/octet-stream` + `attachment`; Cache-Control private; plus
 *        `x-agi-ai-generated`/`x-agi-ai-provenance` when the row carries an
 *        Article 50(2) claim.
 *   401: unauthenticated · 404: unknown, foreign, inactive-workspace, or
 *        deleted asset · 413: asset exceeds the serve cap.
 */

type RouteContext = { params: Promise<{ id: string }> };

/** Serve cap — matches the harvest-side cap plus headroom; nothing bigger is
 * ever persisted by the generated-file pipelines (20MB per-file harvest cap). */
const MAX_SERVE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_SERVE_BYTES = 256 * 1024 * 1024;
const AUTHENTICATED_MEDIA_CACHE_CONTROL = 'private, no-store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 6266 filename sanitization: keep a conservative ASCII subset. */
function safeFilename(name: unknown): string {
  const raw = typeof name === 'string' && name.trim() ? name.trim() : 'file';
  return raw.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 128);
}

function parseSingleByteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return 'invalid';
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (!startText && !endText) return 'invalid';

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return 'invalid';
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function handleGetFile(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { id } = await context.params;

  if (!UUID_RE.test(id)) {
    throw createError.notFound('File not found');
  }

  const asset = await getActiveWorkspaceMediaAssetById(userId, id);
  if (!asset || asset.deletedAt) {
    throw createError.notFound('File not found');
  }

  const isPdfPreview = new URL(request.url).searchParams.get('preview') === 'pdf';
  if (isPdfPreview && asset.mimeType.toLowerCase() !== 'application/pdf') {
    // Fail closed: the same-origin frame exception belongs only to inert PDF
    // bytes. In particular, never allow generated text/html through it.
    throw createError.notFound('PDF preview not available');
  }

  const isVideo = asset.mimeType.toLowerCase().startsWith('video/');
  const serveCap = isVideo ? MAX_VIDEO_SERVE_BYTES : MAX_SERVE_BYTES;
  if (asset.byteSize != null && asset.byteSize > serveCap) {
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the inline serving limit' } },
      { status: 413 },
    );
  }

  if (!isMediaStorageConfigured() || !asset.storagePathname) {
    // No byte source we can proxy — honest 404 rather than a redirect to a
    // cross-origin URL the renderer gates would reject anyway.
    throw createError.notFound('File bytes are not available');
  }

  const filename = safeFilename(asset.metadata['filename']);

  // EU AI Act Article 50(2). This route is how generated bytes actually leave
  // the product — the chat renderers, the Library preview and every download
  // read them from here — so the mark the generation route persisted onto the
  // asset row has to be re-emitted here or it never reaches a consumer.
  const claim = asset.metadata['aiAct'];
  const provenanceHeaders = hasAiGeneratedProvenance(claim)
    ? aiGeneratedHeaders(claim as AiGeneratedProvenance)
    : {};

  const served = servedByteHeaders({
    contentType: asset.mimeType || 'application/octet-stream',
    filename,
  });

  if (isVideo) {
    // Video assets written by the durable generation pipeline always carry an
    // exact byte size. Without it a Range request cannot be validated safely.
    if (asset.byteSize == null || asset.byteSize <= 0) {
      throw createError.notFound('Video bytes are not available');
    }
    const range = parseSingleByteRange(request.headers.get('range'), asset.byteSize);
    if (range === 'invalid') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${asset.byteSize}`,
          'Cache-Control': AUTHENTICATED_MEDIA_CACHE_CONTROL,
        },
      });
    }
    const streamed = await streamStoredMedia(asset.storagePathname, range ?? undefined);
    if (!streamed) throw createError.notFound('Video bytes are not available');
    const expectedLength = range ? range.end - range.start + 1 : asset.byteSize;
    const expectedContentRange = range
      ? `bytes ${range.start}-${range.end}/${asset.byteSize}`
      : undefined;
    if (
      streamed.contentLength !== expectedLength ||
      streamed.contentLength > serveCap ||
      (expectedContentRange !== undefined && streamed.contentRange !== expectedContentRange)
    ) {
      await streamed.body.cancel().catch(() => undefined);
      throw createError.internal('Stored video bytes did not match the authenticated asset.');
    }

    return new NextResponse(streamed.body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': served.contentType,
        'Content-Length': String(streamed.contentLength),
        'Content-Disposition': served.contentDisposition,
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': expectedContentRange } : {}),
        ...provenanceHeaders,
        'Cache-Control': AUTHENTICATED_MEDIA_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const object = await readStoredMedia(asset.storagePathname);
  if (!object) {
    throw createError.notFound('File bytes are not available');
  }
  if (object.data.byteLength > MAX_SERVE_BYTES) {
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the inline serving limit' } },
      { status: 413 },
    );
  }

  // A generated file is model- or sandbox-authored, so `text/html`/`.svg`
  // bytes served `inline` under their own type would execute as a document on
  // this origin on a top-level navigation. `servedByteHeaders` demotes exactly
  // those to an opaque download; images, PDFs, CSV and text are unchanged.
  const bufferedServed = servedByteHeaders({
    contentType: asset.mimeType || object.contentType || 'application/octet-stream',
    filename,
  });

  const body = new Uint8Array(object.data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': bufferedServed.contentType,
      'Content-Length': String(object.data.byteLength),
      'Content-Disposition': bufferedServed.contentDisposition,
      ...provenanceHeaders,
      // Owner-scoped bytes must not survive logout/account switching in a
      // browser cache, even when a shared cache correctly honors `private`.
      'Cache-Control': AUTHENTICATED_MEDIA_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      ...(isPdfPreview
        ? {
            'Content-Security-Policy':
              "default-src 'none'; frame-ancestors 'self'; object-src 'none'",
            'X-Frame-Options': 'SAMEORIGIN',
          }
        : {}),
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGetFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
