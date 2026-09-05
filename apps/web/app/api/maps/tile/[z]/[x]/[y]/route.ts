import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getSecurityHeaders, handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import {
  MAP_TILE_MIN_ZOOM,
  mapTileProvider,
  parseMapTileStyle,
  upstreamTileUrl,
} from '@/lib/maps/map-tile-provider';
import { MAP_TILE_STYLE_PARAM } from '@/lib/maps/map-tile-url';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const TILE_FETCH_TIMEOUT_MS = 5_000;
const TILE_MAX_BYTES = 512 * 1024;

function tileUserAgent(): string {
  const contact = process.env['AGI_MAP_GEOCODER_CONTACT']?.trim();
  return `AGIWorkforce/1.0 (${contact && contact.length <= 120 ? contact : 'https://agiworkforce.com'})`;
}

function parseIndex(raw: string, max: number): number | null {
  if (!/^\d{1,7}$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

async function handleGetTile(
  request: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> },
): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const limited = await withRateLimit(request, 'map-tile');
  if (limited) return limited;

  await getClerkAuthUser(request);

  const provider = mapTileProvider();
  const { z, x, y } = await context.params;
  const zoom = parseIndex(z, provider.maxZoom);
  if (zoom === null || zoom < MAP_TILE_MIN_ZOOM) {
    return NextResponse.json({ error: 'Unsupported tile zoom.' }, { status: 400 });
  }
  const maxIndex = 2 ** zoom - 1;
  const tileX = parseIndex(x, maxIndex);
  const tileY = parseIndex(y.replace(/\.png$/u, ''), maxIndex);
  if (tileX === null || tileY === null) {
    return NextResponse.json({ error: 'Tile out of range.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);
  try {
    const style = parseMapTileStyle(request.nextUrl.searchParams.get(MAP_TILE_STYLE_PARAM));
    const upstream = await fetch(upstreamTileUrl(provider, zoom, tileX, tileY, style), {
      signal: controller.signal,
      headers: { 'User-Agent': tileUserAgent(), Accept: 'image/png,image/*' },
      next: { revalidate: 604_800 },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Tile unavailable.' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Tile unavailable.' }, { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > TILE_MAX_BYTES) {
      return NextResponse.json({ error: 'Tile unavailable.' }, { status: 502 });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        ...getSecurityHeaders(),
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=604800, immutable',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (error) {
    logger.warn({ error, zoom, tileX, tileY }, 'Map tile fetch failed');
    return NextResponse.json({ error: 'Tile unavailable.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

const getWithErrors = withErrorHandler(handleGetTile);

export const GET = withCorsRoute(getWithErrors);

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
