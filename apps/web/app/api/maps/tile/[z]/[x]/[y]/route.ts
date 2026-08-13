import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { MAP_SEARCH_MAX_ZOOM, MAP_SEARCH_MIN_ZOOM } from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getSecurityHeaders, handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Raster tile proxy for the `map-search.v1` card.
 *
 * Why a proxy instead of pointing `<img>` straight at the tile server:
 *   1. OpenStreetMap's tile usage policy requires an identifying User-Agent
 *      and caching. A browser sends neither on our behalf; this route sends
 *      both, so the deployment is a well-behaved consumer rather than an
 *      anonymous one that gets blocked.
 *   2. It keeps the tile host out of the page's request graph, so the map
 *      cannot leak which places a user asked about to a third party.
 *   3. The site CSP stays as-is — these are same-origin images.
 *
 * The route is authenticated and rate limited so it cannot be used as an open
 * relay to fetch tiles on someone else's behalf.
 */

const TILE_ORIGIN = 'https://tile.openstreetmap.org';
const TILE_FETCH_TIMEOUT_MS = 5_000;
const TILE_MAX_BYTES = 512 * 1024;

function tileUserAgent(): string {
  const contact = process.env['AGI_MAP_GEOCODER_CONTACT']?.trim();
  return `AGIWorkforce/1.0 (${contact && contact.length <= 120 ? contact : 'https://agiworkforce.com'})`;
}

/**
 * Parse one path segment as a bounded integer. `Number.parseInt` is not used:
 * it accepts "12abc" and leading "+", either of which would let a crafted path
 * reach the upstream URL builder with a value the caller did not literally
 * write. Only plain digits are admitted.
 */
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

  const { z, x, y } = await context.params;
  const zoom = parseIndex(z, MAP_SEARCH_MAX_ZOOM);
  if (zoom === null || zoom < MAP_SEARCH_MIN_ZOOM) {
    return NextResponse.json({ error: 'Unsupported tile zoom.' }, { status: 400 });
  }
  // At zoom z the grid is 2^z wide, so the largest valid index is 2^z - 1.
  // Validating against the zoom (rather than a constant) is what stops a
  // request for a tile that does not exist from becoming an upstream 404 storm.
  const maxIndex = 2 ** zoom - 1;
  const tileX = parseIndex(x, maxIndex);
  const tileY = parseIndex(y.replace(/\.png$/u, ''), maxIndex);
  if (tileX === null || tileY === null) {
    return NextResponse.json({ error: 'Tile out of range.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${TILE_ORIGIN}/${zoom}/${tileX}/${tileY}.png`, {
      signal: controller.signal,
      headers: { 'User-Agent': tileUserAgent(), Accept: 'image/png,image/*' },
      // Tiles are effectively immutable; reuse them across users and requests.
      next: { revalidate: 604_800 },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Tile unavailable.' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    // Never re-serve whatever the upstream decided to send. If it is not an
    // image, this route is not the thing that will hand it to a browser.
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
