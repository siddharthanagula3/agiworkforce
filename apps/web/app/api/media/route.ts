import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { listMediaAssets, softDeleteMediaAsset } from '@/lib/server/media-assets';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

/**
 * Media Library API
 *   GET    /api/media?kind=image|video  - list the current user's generated media
 *   DELETE /api/media?id=<uuid>         - soft-delete one of the user's assets
 *
 * User-scoped: every cloud surface (web/desktop/mobile cloud) reads the same
 * Library by the authenticated user id.
 */

export const runtime = 'nodejs';

function headers(request: NextRequest) {
  return { ...getCorsHeaders(request), ...getSecurityHeaders() };
}

async function handleListMedia(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const kindParam = request.nextUrl.searchParams.get('kind');
  const kind = kindParam === 'image' || kindParam === 'video' ? kindParam : undefined;

  const assets = await listMediaAssets(userId, { kind });
  return NextResponse.json({ assets }, { headers: headers(request) });
}

async function handleDeleteMedia(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    throw createError.validation('id query parameter is required');
  }

  const deleted = await softDeleteMediaAsset(userId, id);
  return NextResponse.json({ success: deleted }, { headers: headers(request) });
}

export const GET = withErrorHandler(handleListMedia);
export const DELETE = withErrorHandler(handleDeleteMedia);

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: headers(request) })
  );
}
