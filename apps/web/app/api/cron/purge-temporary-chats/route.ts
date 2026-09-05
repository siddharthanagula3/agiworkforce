import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Batched rather than one unbounded DELETE, and counted rather than returning
 * every id.
 *
 * The single statement it replaces had no LIMIT and no duration ceiling, so the
 * first night the backlog outgrew the function timeout it rolled back, deleted
 * nothing, and faced a strictly larger set the next night, a one-way ratchet
 * that ends with the 30-day retention promise silently unkept. Matches the
 * idiom `retention-service.ts` already uses for the workspace sweep: small
 * statements that do not hold locks on the table serving live chat, and a loop
 * that stops as soon as a batch comes back short.
 */
const PURGE_BATCH = 500;
const MAX_BATCHES = 200;
const PURGE_BUDGET_MS = 240_000;
const RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAtMs = Date.now();
  const db = getNeonDb();

  let purged = 0;
  let remaining = false;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      if (Date.now() - startedAtMs > PURGE_BUDGET_MS) {
        remaining = true;
        break;
      }
      const deleted = await db.query<{ count: number }>(
        `with expired as (
           delete from web_conversations
            where id in (
              select id from web_conversations
               where is_temporary = true
                 and created_at < now() - make_interval(days => $1)
               limit $2
            )
            returning id
         )
         select count(*)::int as count from expired`,
        [RETENTION_DAYS, PURGE_BATCH],
      );
      const count = deleted[0]?.count ?? 0;
      purged += count;
      if (count < PURGE_BATCH) break;
      remaining = batch === MAX_BATCHES - 1;
    }

    if (remaining) {
      logger.warn(
        { purged },
        'Temporary chat purge hit its per-run ceiling · a backlog remains past the retention cutoff',
      );
    }
    logger.info({ purged, remaining }, 'Purged expired temporary chat conversations');

    return NextResponse.json({
      message: 'Temporary chat purge completed',
      purged,
      remaining,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), purged },
      'Temporary chat purge cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
