import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { fetchCliReleaseAvailability } from '@/lib/releases/github-cli-releases';

async function handleGetLatestCliRelease(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const availability = await fetchCliReleaseAvailability();
  if (!availability) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No CLI release archive is published' } },
      { status: 404 },
    );
  }

  return NextResponse.json(availability, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}

export const GET = withErrorHandler(handleGetLatestCliRelease);
