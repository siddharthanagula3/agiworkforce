import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  consolidateMemories,
  sweepExpiredMemories,
} from '@/lib/services/managed-memory-context-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized memory expiry cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getNeonDb();
    const summary = await sweepExpiredMemories(db);
    if (summary.remaining) {
      logger.warn(summary, 'Memory expiry sweep hit its per-run ceiling');
    }
    logger.info(summary, 'Memory expiry sweep completed');
    if (summary.remaining) return NextResponse.json({ ...summary, consolidation: null });
    const consolidation = await consolidateMemories(db);
    if (consolidation.remaining) {
      logger.warn(consolidation, 'Memory consolidation hit its per-run ceiling');
    }
    logger.info(consolidation, 'Memory consolidation completed');
    return NextResponse.json({ ...summary, consolidation });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Memory expiry cron failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
