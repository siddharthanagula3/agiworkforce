import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLIENT_CAPABILITIES_REQUEST_HEADER,
  LARGE_CHAT_FILES_CAPABILITY,
  MAX_CHAT_ATTACHMENT_BYTES,
  hasClientCapability,
} from '@agiworkforce/cloud-contracts';
import { recordEgressBytes } from '@/lib/services/infrastructure-cost';
import {
  assertDownloadAllowance,
  downloadSpendsAllowance,
} from '@/lib/services/tier-unit-quota-service';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getActiveWorkspaceMediaAssetById } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isMediaStorageConfigured,
  isSealedPrivateChatAttachmentPathname,
  streamStoredMedia,
} from '@/lib/server/media-storage';
import {
  getPresignedPrivateDownloadUrl,
  headPrivateObject,
  isPrivateObjectStorageConfigured,
} from '@/lib/server/object-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import {
  resolveProductAnalyticsSurface,
  trackProductAnalyticsEvent,
} from '@/lib/server/product-analytics';
import {
  aiGeneratedHeaders,
  hasAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SERVE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_SERVE_BYTES = 256 * 1024 * 1024;
const AUTHENTICATED_MEDIA_CACHE_CONTROL = 'private, no-store';
const LARGE_FILE_REDIRECT_TTL_SECONDS = 300;
const LARGE_FILE_DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';
const CHAT_ATTACHMENT_SOURCE = 'chat-attachment';
const PDF_PREVIEW_TOO_LARGE_MESSAGE = 'This PDF is too large to preview. Download it to open it.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function readBounded(
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

function payloadTooLarge(): NextResponse {
  return NextResponse.json(
    { error: { code: 'PAYLOAD_TOO_LARGE', message: 'File exceeds the inline serving limit' } },
    { status: 413 },
  );
}

function previewTooLarge(): NextResponse {
  return NextResponse.json(
    { error: { code: 'preview_too_large', message: PDF_PREVIEW_TOO_LARGE_MESSAGE } },
    { status: 413 },
  );
}

interface StoredChatFile {
  userId: string;
  byteSize: number | null;
  storagePathname: string | null;
  metadata: Record<string, unknown>;
}

interface SealedLargeChatFile extends StoredChatFile {
  byteSize: number;
  storagePathname: string;
}

function isSealedLargeChatFile(
  asset: StoredChatFile,
  userId: string,
): asset is SealedLargeChatFile {
  return (
    asset.userId === userId &&
    asset.metadata['source'] === CHAT_ATTACHMENT_SOURCE &&
    asset.byteSize != null &&
    asset.byteSize > MAX_CHAT_ATTACHMENT_BYTES &&
    asset.storagePathname != null &&
    isSealedPrivateChatAttachmentPathname(asset.storagePathname)
  );
}

function acceptsLargeFileRedirect(request: NextRequest): boolean {
  return (
    (request.headers.get('sec-fetch-mode') === 'navigate' && !request.headers.has('sec-purpose')) ||
    hasClientCapability(
      request.headers.get(CLIENT_CAPABILITIES_REQUEST_HEADER),
      LARGE_CHAT_FILES_CAPABILITY,
    )
  );
}

async function redirectToLargeChatFile(
  request: NextRequest,
  scope: { db: DatabaseAdapter; userId: string },
  asset: SealedLargeChatFile,
  spendsAllowance: boolean,
): Promise<NextResponse> {
  const head = await headPrivateObject(asset.storagePathname);
  if (!head) throw createError.notFound('File bytes are not available');
  if (head.contentLength !== asset.byteSize) {
    throw createError.internal('Stored file bytes did not match the authenticated asset.');
  }
  if (spendsAllowance) {
    await assertDownloadAllowance({ db: scope.db, userId: scope.userId, bytes: asset.byteSize });
  }
  const url = await getPresignedPrivateDownloadUrl({
    key: asset.storagePathname,
    fileName: safeFilename(asset.metadata['filename']),
    expiresInSeconds: LARGE_FILE_REDIRECT_TTL_SECONDS,
    contentType: LARGE_FILE_DOWNLOAD_CONTENT_TYPE,
  });
  recordEgressBytes({
    userId: scope.userId,
    bytes: asset.byteSize,
    surface: resolveProductAnalyticsSurface(request),
    provider: 'object_storage',
    downloadAllowanceExempt: !spendsAllowance,
  });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': AUTHENTICATED_MEDIA_CACHE_CONTROL },
  });
}

async function handleGetFile(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  if (!UUID_RE.test(id)) {
    throw createError.notFound('File not found');
  }

  const asset = await getActiveWorkspaceMediaAssetById(userId, id, db, { organizationId });
  if (!asset || asset.deletedAt) {
    throw createError.notFound('File not found');
  }

  trackProductAnalyticsEvent(
    { userId },
    {
      name: 'library_item_opened',
      surface: resolveProductAnalyticsSurface(request),
      properties: { kind: asset.kind },
    },
  );

  const isPdfPreview = new URL(request.url).searchParams.get('preview') === 'pdf';
  if (isPdfPreview && asset.mimeType.toLowerCase() !== 'application/pdf') {
    throw createError.notFound('PDF preview not available');
  }

  const isVideo = asset.mimeType.toLowerCase().startsWith('video/');
  const serveCap = isVideo ? MAX_VIDEO_SERVE_BYTES : MAX_SERVE_BYTES;
  if (asset.byteSize != null && asset.byteSize > serveCap) {
    if (!isVideo && isSealedLargeChatFile(asset, userId)) {
      if (isPdfPreview) return previewTooLarge();
      if (acceptsLargeFileRedirect(request) && isPrivateObjectStorageConfigured()) {
        return redirectToLargeChatFile(
          request,
          { db, userId },
          asset,
          downloadSpendsAllowance(asset, userId),
        );
      }
    }
    return payloadTooLarge();
  }

  if (!isMediaStorageConfigured() || !asset.storagePathname) {
    throw createError.notFound('File bytes are not available');
  }

  const filename = safeFilename(asset.metadata['filename']);
  const spendsAllowance = downloadSpendsAllowance(asset, userId);

  const claim = asset.metadata['aiAct'];
  const provenanceHeaders = hasAiGeneratedProvenance(claim)
    ? aiGeneratedHeaders(claim as AiGeneratedProvenance)
    : {};

  const served = servedByteHeaders({
    contentType: asset.mimeType || 'application/octet-stream',
    filename,
  });

  if (isVideo) {
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
    const expectedLength = range ? range.end - range.start + 1 : asset.byteSize;
    if (spendsAllowance) await assertDownloadAllowance({ db, userId, bytes: expectedLength });
    const streamed = await streamStoredMedia(asset.storagePathname, range ?? undefined);
    if (!streamed) throw createError.notFound('Video bytes are not available');
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

    recordEgressBytes({
      userId,
      bytes: expectedLength,
      surface: resolveProductAnalyticsSurface(request),
      provider: 'object_storage',
      downloadAllowanceExempt: !spendsAllowance,
    });

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

  const streamed = await streamStoredMedia(asset.storagePathname);
  if (!streamed) {
    throw createError.notFound('File bytes are not available');
  }
  if (streamed.contentLength > MAX_SERVE_BYTES) {
    await streamed.body.cancel().catch(() => undefined);
    return payloadTooLarge();
  }
  const data = await readBounded(streamed.body, MAX_SERVE_BYTES);
  if (!data) return payloadTooLarge();

  const bufferedServed = servedByteHeaders({
    contentType: asset.mimeType || streamed.contentType || 'application/octet-stream',
    filename,
  });

  if (spendsAllowance) await assertDownloadAllowance({ db, userId, bytes: data.byteLength });
  const body = new Uint8Array(data);
  recordEgressBytes({
    userId,
    bytes: body.byteLength,
    surface: resolveProductAnalyticsSurface(request),
    provider: 'object_storage',
    downloadAllowanceExempt: !spendsAllowance,
  });
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': bufferedServed.contentType,
      'Content-Length': String(data.byteLength),
      'Content-Disposition': bufferedServed.contentDisposition,
      ...provenanceHeaders,
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
