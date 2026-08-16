
import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { listAvailableSupportActions } from '@/lib/support/actions/service';

async function handleGet(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'support-account-context');
  if (rateLimited) return rateLimited;

  await getClerkAuthUser(request);

  return NextResponse.json(listAvailableSupportActions());
}

export const GET = withErrorHandler(handleGet);
