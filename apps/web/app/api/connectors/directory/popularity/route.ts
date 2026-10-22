import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { type ConnectorDirectoryPopularityResponse } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

import { loadConnectorPopularity } from './ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'chat-conversation');
  if (rateLimited) return rateLimited;

  try {
    const ranked = await loadConnectorPopularity();
    return NextResponse.json({ ranked } satisfies ConnectorDirectoryPopularityResponse, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
        'Vercel-CDN-Cache-Control': 'max-age=900, stale-while-revalidate=3600',
        Vary: 'Origin',
      },
    });
  } catch (error) {
    logger.warn({ error }, 'Connector popularity unavailable');
    return NextResponse.json({ ranked: [] } satisfies ConnectorDirectoryPopularityResponse, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
