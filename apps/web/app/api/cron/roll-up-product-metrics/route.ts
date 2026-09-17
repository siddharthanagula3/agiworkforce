import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { rollUpProductMetrics } from '@/features/admin/services/product-metrics';

export const runtime = 'nodejs';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized product metrics rollup cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await rollUpProductMetrics(new Date());
    logger.info(result, 'Product metrics rolled up');
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Product metrics rollup failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
