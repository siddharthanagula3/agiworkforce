import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { isAuthGateRefusal } from '@/lib/api-auth-response';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { toCsv } from '@/lib/csv';
import {
  USAGE_EXPORT_ROW_LIMIT,
  readAccountUsageRecords,
  resolveUsageHistoryGranularity,
  usageHistoryWindowStart,
  type AccountUsageRecord,
} from '@/lib/services/account-usage-history-service';
import { resolveUsageWindow } from '@/lib/services/usage-aggregation';
import { rateCardUsageLabel } from '@agiworkforce/types';

export const runtime = 'nodejs';

const HEADER = [
  'created_at',
  'request_id',
  'product_area',
  'operation',
  'model',
  'project',
  'input_tokens',
  'output_tokens',
  'credits',
];

async function handler(request: NextRequest) {
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request);
  } catch (error) {
    if (isApiKeyScopeError(error) || isAuthGateRefusal(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  const params = new URL(request.url).searchParams;
  const granularity = resolveUsageHistoryGranularity(params.get('granularity'));
  const window = resolveUsageWindow(
    params.get('from') ?? usageHistoryWindowStart(granularity).toISOString(),
    params.get('to'),
  );

  let records: AccountUsageRecord[];
  try {
    records = await readAccountUsageRecords(scoped.db, scoped.userId, window);
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to export usage');
    throw createError.internal('Failed to export usage');
  }

  const csv = toCsv([
    ['# window_from', window.from],
    ['# window_to', window.to],
    ['# rows', records.length],
    ['# truncated', records.length >= USAGE_EXPORT_ROW_LIMIT ? 'true' : 'false'],
    HEADER,
    ...records.map((record) => [
      record.createdAt,
      record.requestId,
      record.workload ?? '',
      record.operation ?? '',
      rateCardUsageLabel(record.model) ?? record.model,
      record.projectName ?? record.projectId ?? '',
      record.inputTokens,
      record.outputTokens,
      Number(record.credits.toFixed(4)),
    ]),
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="usage-${window.from.slice(0, 10)}-to-${window.to.slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withErrorHandler(withRateLimitHandler(handler, 'credits-balance'));
