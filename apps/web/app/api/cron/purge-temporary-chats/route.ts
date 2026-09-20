import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';

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

  // A legal hold beats the temporary-chat promise: a held chat survives its
  // window and goes on the first run after the hold is released.
  const chatDue = `candidate.is_temporary = true
          and candidate.created_at < now() - make_interval(days => $1)`;
  const attachmentDue = `candidate.temporary_chat
           and candidate.deleted_at is null
           and candidate.created_at < now() - make_interval(days => $1)`;

  try {
    const heldChats = await countHeldRows(db, 'conversation', {
      table: 'web_conversations',
      alias: 'candidate',
      where: chatDue,
      params: [RETENTION_DAYS],
    });
    const heldAttachments = await countHeldRows(db, 'file', {
      table: 'media_assets',
      alias: 'candidate',
      where: attachmentDue,
      params: [RETENTION_DAYS],
    });
    const chatExclusion = legalHoldExclusion('conversation', {
      alias: 'candidate',
      nextParamIndex: 3,
    });
    const attachmentExclusion = legalHoldExclusion('file', {
      alias: 'candidate',
      nextParamIndex: 3,
    });
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      if (Date.now() - startedAtMs > PURGE_BUDGET_MS) {
        remaining = true;
        break;
      }
      const deleted = await db.query<{ count: number }>(
        `with expired as (
           delete from web_conversations
            where id in (
              select candidate.id from web_conversations candidate
               where ${chatDue}
                 and ${chatExclusion.sql}
               limit $2
            )
            returning id
         )
         select count(*)::int as count from expired`,
        [RETENTION_DAYS, PURGE_BATCH, ...chatExclusion.params],
      );
      const count = deleted[0]?.count ?? 0;
      purged += count;
      if (count < PURGE_BATCH) break;
      remaining = batch === MAX_BATCHES - 1;
    }

    // A file attached to a temporary chat is retired on the same clock as the
    // chat (0218). Marking it deleted rather than deleting it hands it to
    // purge-deleted-media, which is the only job that removes stored bytes, so
    // there is one place that talks to object storage instead of two.
    const attachments = await db.query<{ count: number }>(
      `with expired as (
         update public.media_assets
            set deleted_at = now()
          where id in (
            select candidate.id from public.media_assets candidate
             where ${attachmentDue}
               and ${attachmentExclusion.sql}
             limit $2
          )
          returning id
       )
       select count(*)::int as count from expired`,
      [RETENTION_DAYS, PURGE_BATCH, ...attachmentExclusion.params],
    );
    const attachmentsRetired = attachments[0]?.count ?? 0;

    if (remaining) {
      logger.warn(
        { purged },
        'Temporary chat purge hit its per-run ceiling · a backlog remains past the retention cutoff',
      );
    }
    // Counted, never named: whose chats they are is not for a log.
    logger.info(
      { purged, attachmentsRetired, remaining, heldChats, heldAttachments },
      heldChats + heldAttachments > 0
        ? 'Purged expired temporary chats; some were preserved by an active legal hold and will be purged once it is released'
        : 'Purged expired temporary chat conversations',
    );

    return NextResponse.json({
      message: 'Temporary chat purge completed',
      purged,
      attachmentsRetired,
      heldChats,
      heldAttachments,
      remaining,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), purged },
      'Temporary chat purge cron job failed; held rows were never candidates',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
