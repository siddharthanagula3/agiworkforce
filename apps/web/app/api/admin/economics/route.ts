import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  isEconomicsGrouping,
  readEconomicsSummary,
  type EconomicsGrouping,
} from '@/features/admin/services/economics-summary';

const NO_STORE = 'private, no-store';
const DEFAULT_GROUPING: EconomicsGrouping = 'total';
const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;

  await requirePlatformAdmin(request);

  const params = request.nextUrl.searchParams;
  const to = parseDate(params.get('to'), new Date());
  const from = parseDate(
    params.get('from'),
    new Date(to.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY),
  );
  const requestedGrouping = params.get('group_by');
  const groupBy =
    requestedGrouping && isEconomicsGrouping(requestedGrouping)
      ? requestedGrouping
      : DEFAULT_GROUPING;

  const summary = await readEconomicsSummary({ from, to, groupBy });

  return NextResponse.json(summary, { headers: { 'Cache-Control': NO_STORE } });
}

export const GET = withErrorHandler(handleGet);
