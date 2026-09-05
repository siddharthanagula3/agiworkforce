import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getSecurityHeaders, handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { MAP_TILE_MIN_ZOOM, mapTileProvider } from '@/lib/maps/map-tile-provider';
import {
  MAP_TILE_PROXY_URL_TEMPLATE,
  MAP_TILE_PROXY_DARK_URL_TEMPLATE,
} from '@/lib/maps/map-tile-url';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const CONFIG_CACHE_CONTROL = 'private, max-age=300';

/**
 * What the browser needs to draw a map, and nothing more. The upstream tile
 * endpoint stays server side: the client only ever asks this origin for a
 * tile, so swapping tile vendors never touches a component or a persisted card.
 */
async function handleGetMapConfig(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const limited = await withRateLimit(request, 'map-tile');
  if (limited) return limited;

  await getClerkAuthUser(request);

  const provider = mapTileProvider();

  return NextResponse.json(
    {
      tileUrlTemplate: MAP_TILE_PROXY_URL_TEMPLATE,
      attribution: provider.attribution,
      darkTileUrlTemplate: MAP_TILE_PROXY_DARK_URL_TEMPLATE,
      darkAttribution: provider.darkAttribution,
      dimLightTiles: provider.dimLightTiles,
      minZoom: MAP_TILE_MIN_ZOOM,
      maxZoom: provider.maxZoom,
    },
    { headers: { ...getSecurityHeaders(), 'Cache-Control': CONFIG_CACHE_CONTROL } },
  );
}

const getWithErrors = withErrorHandler(handleGetMapConfig);

export const GET = withCorsRoute(getWithErrors);

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
