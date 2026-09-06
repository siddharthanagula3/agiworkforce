import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import {
  ingestBudgetForMaxDuration,
  ingestPluginDirectory,
} from '@/features/plugins/server/directory/ingest';

export const runtime = 'nodejs';
export const maxDuration = 800;

const INGEST_BUDGET = ingestBudgetForMaxDuration(maxDuration);
const MODE_PARAM = 'mode';
const REBUILD_MODE = 'rebuild';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized plugin directory refresh cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rebuild = request.nextUrl.searchParams.get(MODE_PARAM) === REBUILD_MODE;
    const summary = await ingestPluginDirectory({ budget: INGEST_BUDGET, rebuild });
    logger.info(summary, 'Plugin directory refreshed');
    return NextResponse.json(summary);
  } catch (error) {
    if (isAppError(error)) {
      logger.warn({ code: error.code }, 'Plugin directory refresh cron request refused');
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Plugin directory refresh cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
