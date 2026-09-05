import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { PLACES_CARD_PHOTO_REFERENCE_MAX_LENGTH } from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getSecurityHeaders, handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import {
  PLACE_PHOTO_DEFAULT_WIDTH_PX,
  PLACE_PHOTO_MAX_WIDTH_PX,
  PLACE_PHOTO_MIN_WIDTH_PX,
  PLACE_PHOTO_REFERENCE_PARAM,
  PLACE_PHOTO_WIDTH_PARAM,
} from '@/lib/maps/place-photo-url';
import { createGooglePlacesProvider } from '@/lib/places/google-places-provider';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const PHOTO_CACHE_CONTROL = 'private, max-age=86400';

function parseWidth(raw: string | null): number {
  if (raw === null) return PLACE_PHOTO_DEFAULT_WIDTH_PX;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return PLACE_PHOTO_DEFAULT_WIDTH_PX;
  return Math.max(PLACE_PHOTO_MIN_WIDTH_PX, Math.min(PLACE_PHOTO_MAX_WIDTH_PX, parsed));
}

async function handleGetPlacePhoto(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const limited = await withRateLimit(request, 'map-tile');
  if (limited) return limited;

  await getClerkAuthUser(request);

  const reference = request.nextUrl.searchParams.get(PLACE_PHOTO_REFERENCE_PARAM) ?? '';
  if (reference.length === 0 || reference.length > PLACES_CARD_PHOTO_REFERENCE_MAX_LENGTH) {
    return NextResponse.json({ error: 'Unknown photo.' }, { status: 400 });
  }

  const provider = createGooglePlacesProvider();
  if (!provider.configured()) {
    return NextResponse.json({ error: 'Place photos are unavailable.' }, { status: 404 });
  }

  const outcome = await provider.photo({
    reference,
    maxWidthPx: parseWidth(request.nextUrl.searchParams.get(PLACE_PHOTO_WIDTH_PARAM)),
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: 'Place photo unavailable.' },
      { status: outcome.errorCode === 'invalid_tool_input' ? 400 : 502 },
    );
  }

  return new NextResponse(outcome.body, {
    status: 200,
    headers: {
      ...getSecurityHeaders(),
      'Content-Type': outcome.contentType,
      'Content-Length': String(outcome.body.byteLength),
      'Cache-Control': PHOTO_CACHE_CONTROL,
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

const getWithErrors = withErrorHandler(handleGetPlacePhoto);

export const GET = withCorsRoute(getWithErrors);

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
