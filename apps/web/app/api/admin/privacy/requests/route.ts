import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withRateLimit } from '@/lib/rate-limit';
import { readOpenDataRightsRequests } from '@/lib/server/data-rights-requests';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const requests = await readOpenDataRightsRequests();

  return NextResponse.json(
    { requests, count: requests.length },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
