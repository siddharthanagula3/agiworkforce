import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readReportingWindow } from '../reporting-window';
import {
  isCostRollupDimension,
  readCostOperations,
  type CostRollupDimension,
} from '@/lib/services/cost-rollups';

const NO_STORE = 'private, no-store';
const DEFAULT_DIMENSION: CostRollupDimension = 'capability';

function parseCount(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const params = request.nextUrl.searchParams;
  const { from, to } = readReportingWindow(params);
  const requested = params.get('group_by');
  const windowMinutes = parseCount(params.get('loop_window_minutes'));
  const eventThreshold = parseCount(params.get('loop_event_threshold'));

  const report = await readCostOperations({
    from,
    to,
    dimension: requested && isCostRollupDimension(requested) ? requested : DEFAULT_DIMENSION,
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
    ...(eventThreshold === undefined ? {} : { eventThreshold }),
  });

  return NextResponse.json(report, { headers: { 'Cache-Control': NO_STORE } });
}

export const GET = withErrorHandler(handleGet);
