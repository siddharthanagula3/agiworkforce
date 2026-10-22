import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { type ConnectorDirectoryPopularityResponse } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';

import { loadConnectorPopularity } from './ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AVAILABLE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
  'Vercel-CDN-Cache-Control': 'max-age=900, stale-while-revalidate=3600',
  Vary: 'Origin',
};

const UNAVAILABLE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'Vercel-CDN-Cache-Control': 'max-age=60',
  Vary: 'Origin',
};

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  const { ranked, available } = await loadConnectorPopularity();
  return NextResponse.json({ ranked } satisfies ConnectorDirectoryPopularityResponse, {
    status: 200,
    headers: available ? AVAILABLE_CACHE_HEADERS : UNAVAILABLE_CACHE_HEADERS,
  });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
