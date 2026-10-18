import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readReportingWindow } from '../reporting-window';
import {
  isEconomicsGrouping,
  readEconomicsSummary,
  type EconomicsGrouping,
} from '@/features/admin/services/economics-summary';

const NO_STORE = 'private, no-store';
const DEFAULT_GROUPING: EconomicsGrouping = 'total';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const params = request.nextUrl.searchParams;
  const { from, to } = readReportingWindow(params);
  const requestedGrouping = params.get('group_by');
  const groupBy =
    requestedGrouping && isEconomicsGrouping(requestedGrouping)
      ? requestedGrouping
      : DEFAULT_GROUPING;

  const summary = await readEconomicsSummary({ from, to, groupBy });

  return NextResponse.json(summary, { headers: { 'Cache-Control': NO_STORE } });
}

export const GET = withErrorHandler(handleGet);
