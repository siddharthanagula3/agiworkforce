import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { allocateInfrastructureCosts } from '@/lib/services/infrastructure-allocation-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized infrastructure cost allocation cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await allocateInfrastructureCosts(new Date());

    if (run.missing.length > 0) {
      logger.warn(
        {
          event: 'infrastructure_bill_missing',
          billingMonth: run.billingMonth,
          vendors: run.missing,
        },
        'These vendors have no recorded bill and no committed monthly rate; their cost is not allocated',
      );
    }

    return NextResponse.json(run, { status: run.failed.length > 0 ? 500 : 200 });
  } catch (error) {
    logger.error(
      {
        event: 'infrastructure_allocation_run_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Infrastructure cost allocation failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
