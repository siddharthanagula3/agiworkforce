import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  FinanceOverviewQuerySchema,
  type FinanceOverviewResponse,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { bankAccountsUnavailableReason } from '@/lib/connectors/bank-accounts';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readFinanceOverview } from '@/lib/services/finance-overview-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleGet(request: NextRequest): Promise<Response> {
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'finance-overview', `user:${scoped.userId}`);
  if (limited) return limited;

  const query = FinanceOverviewQuerySchema.safeParse({
    period: request.nextUrl.searchParams.get('period') ?? undefined,
  });
  if (!query.success) throw createError.validation('Choose a period of 30d, 90d or 12m.');

  const unavailable = bankAccountsUnavailableReason();
  const body: FinanceOverviewResponse = unavailable
    ? { status: 'unavailable', message: unavailable }
    : await readFinanceOverview(scoped.userId, query.data.period);
  return NextResponse.json(body, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
