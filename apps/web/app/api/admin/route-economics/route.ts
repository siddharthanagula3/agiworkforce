import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readRouteEconomics } from '@/features/admin/services/route-economics';

const NO_STORE = 'private, no-store';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  return NextResponse.json(await readRouteEconomics(), {
    headers: { 'Cache-Control': NO_STORE },
  });
}

export const GET = withErrorHandler(handleGet);
