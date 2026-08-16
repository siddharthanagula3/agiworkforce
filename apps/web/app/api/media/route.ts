import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  listMediaAssets,
  permanentlyDeleteMediaAsset,
  softDeleteMediaAsset,
  restoreMediaAsset,
} from '@/lib/server/media-assets';
import { authenticatedMediaUrl } from '@/lib/server/media-storage';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

export const runtime = 'nodejs';

const DeleteMediaQuerySchema = z.object({
  id: z.string().uuid(),
  permanent: z.enum(['true']).optional(),
});

function headers(request: NextRequest) {
  return { ...getCorsHeaders(request), ...getSecurityHeaders() };
}

async function handleListMedia(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const kindParam = request.nextUrl.searchParams.get('kind');
  const kind = kindParam === 'image' || kindParam === 'video' ? kindParam : undefined;

  const assets = (await listMediaAssets(userId, { kind })).map((asset) => ({
    ...asset,
    storageUrl: authenticatedMediaUrl(asset.id),
  }));
  return NextResponse.json({ assets }, { headers: headers(request) });
}

async function handleDeleteMedia(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const rawId = request.nextUrl.searchParams.get('id');
  const parsed = DeleteMediaQuerySchema.safeParse({
    id: rawId,
    permanent: request.nextUrl.searchParams.get('permanent') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('A valid id query parameter (uuid) is required');
  }

  const deleted = parsed.data.permanent
    ? await permanentlyDeleteMediaAsset(userId, parsed.data.id)
    : await softDeleteMediaAsset(userId, parsed.data.id);
  return NextResponse.json({ success: deleted }, { headers: headers(request) });
}

async function handleRestoreMedia(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const rawId = request.nextUrl.searchParams.get('id');
  const parsed = DeleteMediaQuerySchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw createError.validation('A valid id query parameter (uuid) is required');
  }

  const restored = await restoreMediaAsset(userId, parsed.data.id);
  return NextResponse.json({ success: restored }, { headers: headers(request) });
}

export const GET = withErrorHandler(handleListMedia);
export const DELETE = withErrorHandler(handleDeleteMedia);
export const POST = withErrorHandler(handleRestoreMedia);

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: headers(request) })
  );
}
