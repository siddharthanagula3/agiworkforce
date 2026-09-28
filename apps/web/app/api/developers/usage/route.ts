import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { developerUsageMonth, readDeveloperUsage } from '@/lib/services/developer-usage-service';

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'developer-console');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  return NextResponse.json(await readDeveloperUsage(db, userId, developerUsageMonth()), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withErrorHandler(handleGet);
