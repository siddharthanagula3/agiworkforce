import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';

export const runtime = 'nodejs';

const RECOVERY_WINDOW_DAYS = 30;

const MAX_ASSETS_PER_RUN = 500;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getNeonDb();

    const expired = await db.query<{ id: string; storage_pathname: string | null }>(
      `
        select id, storage_pathname
          from public.media_assets
         where deleted_at is not null
           and deleted_at < now() - interval '${RECOVERY_WINDOW_DAYS} days'
         order by deleted_at asc
         limit ${MAX_ASSETS_PER_RUN}
      `,
      [],
    );

    if (expired.length === 0) {
      return NextResponse.json({ message: 'No expired media to purge', purged: 0 });
    }

    const { deleted: objectsDeleted, failedPathnames } = await deleteStoredMediaObjects(
      expired.map((row) => row.storage_pathname),
    );
    const stillStored = new Set(failedPathnames);

    const purgeableIds = expired
      .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
      .map((row) => row.id);

    let rowsPurged = 0;
    if (purgeableIds.length > 0) {
      const purged = await db.query<{ id: string }>(
        `delete from public.media_assets where id = any($1::uuid[]) returning id`,
        [purgeableIds],
      );
      rowsPurged = purged.length;
    }

    logger.info(
      {
        candidates: expired.length,
        objectsDeleted,
        objectsFailed: failedPathnames.length,
        rowsPurged,
      },
      'Purged expired soft-deleted media assets',
    );

    return NextResponse.json({
      message: 'Deleted media purge completed',
      candidates: expired.length,
      objectsDeleted,
      objectsFailed: failedPathnames.length,
      purged: rowsPurged,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Deleted media purge cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
