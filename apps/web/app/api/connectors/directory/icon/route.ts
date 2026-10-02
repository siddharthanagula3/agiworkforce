import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CONNECTOR_DIRECTORY_ICON_ID_PARAM } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { clientIpRateLimitIdentifier, withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getIconForUrl } from '@/lib/connectors/directory/icon-fetch';
import { getDirectoryIconUrl } from '@/lib/connectors/directory/memory-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(
    request,
    'connector-directory-icon',
    clientIpRateLimitIdentifier(request),
  );
  if (rateLimited) return rateLimited;

  const connectorId = new URL(request.url).searchParams.get(CONNECTOR_DIRECTORY_ICON_ID_PARAM);
  if (!connectorId) throw createError.validation('id query parameter is required');

  const iconUrl = await getDirectoryIconUrl(connectorId);
  if (!iconUrl) throw createError.notFound('No icon recorded for this connector');

  const icon = await getIconForUrl(iconUrl);
  if (!icon) throw createError.notFound('Icon could not be fetched');

  return new NextResponse(Buffer.from(icon.base64, 'base64'), {
    status: 200,
    headers: {
      'Content-Type': icon.contentType,
      'Cache-Control': 'public, max-age=2592000, immutable',
      'Vercel-CDN-Cache-Control': 'max-age=2592000',
      Vary: 'Origin',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
