import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listRecentScheduleRuns } from '@/lib/services/schedule-service';
import {
  MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
  clampSchedulePageOffset,
  clampSchedulePageSize,
} from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

async function handleListRecentRuns(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  const url = new URL(request.url);
  const limit = clampSchedulePageSize(
    integerQueryValue(url.searchParams.get('limit'), MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE),
    MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
    MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
  );
  const offset = clampSchedulePageOffset(integerQueryValue(url.searchParams.get('offset'), 0));
  const runs = await listRecentScheduleRuns(db, userId, { limit, offset });
  return NextResponse.json({ runs, pagination: { limit, offset } });
}

export const GET = withErrorHandler(handleListRecentRuns);
