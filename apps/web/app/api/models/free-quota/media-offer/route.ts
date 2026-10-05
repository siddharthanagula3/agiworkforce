import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readFreeMediaOffer } from '@/lib/server/free-media-offer-reader';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

export const runtime = 'nodejs';

const SHARED_CACHE = {
  'Cache-Control': `public, s-maxage=${RENDER_CACHE_SECONDS.liveSignal}`,
};

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  return NextResponse.json(await readFreeMediaOffer(), { headers: SHARED_CACHE });
}

export const GET = withErrorHandler(handleGet);
