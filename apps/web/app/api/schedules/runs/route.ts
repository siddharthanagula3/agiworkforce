import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { decodeKeysetCursor } from '@/lib/identity/pagination';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listRecentScheduleRuns } from '@/lib/services/schedule-service';
import {
  MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE,
  clampSchedulePageSize,
  type ManagedCloudScheduleRecentRunListResponse,
} from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';

const CursorSchema = z.object({
  sortValue: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  id: z.string().uuid(),
});

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
  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? CursorSchema.safeParse(decodeKeysetCursor(cursorParam)) : null;
  if (cursor && !cursor.success) {
    throw createError.validation('Invalid query parameters', cursor.error.issues);
  }
  const page = await listRecentScheduleRuns(db, userId, {
    limit,
    cursor: cursor ? cursor.data : null,
  });
  return NextResponse.json<ManagedCloudScheduleRecentRunListResponse>({
    runs: page.runs,
    nextCursor: page.nextCursor,
  });
}

export const GET = withErrorHandler(handleListRecentRuns);
