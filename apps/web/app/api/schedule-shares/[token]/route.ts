import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudScheduleShareResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import { getSharedSchedule } from '@/lib/services/schedule-share-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleGetSharedSchedule(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;
  const { token } = await context.params;
  const share = await getSharedSchedule(getNeonDb(), token);
  if (!share) throw createError.notFound('This shared schedule link is not available');
  const shared: ManagedCloudScheduleShareResponse = { share };
  return NextResponse.json(shared);
}

export const GET = withErrorHandler(handleGetSharedSchedule);
