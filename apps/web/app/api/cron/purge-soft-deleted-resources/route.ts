import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { purgeSoftDeletedResources } from '@/lib/resources/purge-soft-deleted';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Off until an operator turns it on: it destroys rows that nothing purged before this route existed.
function purgeEnabled(): boolean {
  return process.env['SOFT_DELETED_RESOURCE_PURGE_ENABLED']?.trim().toLowerCase() === 'true';
}

// Runs after the media purge, which owns the two stores addressing object storage.
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!purgeEnabled()) {
    logger.info({ event: 'soft_deleted_resources_purge_disabled' }, 'Soft-deleted purge is off');
    return NextResponse.json({ message: 'Soft-deleted resource purge is disabled', purged: 0 });
  }

  try {
    const result = await purgeSoftDeletedResources(getNeonDb());

    // Counted, never named: which accounts they belong to is not for a log.
    logger.info(
      {
        event: 'soft_deleted_resources_purged',
        purged: result.purged,
        heldFromPurge: result.heldFromPurge,
        skipped: result.skipped,
        failed: result.failed,
      },
      result.heldFromPurge > 0
        ? 'Purged expired soft-deleted resources; some were preserved by an active legal hold and will be purged once it is released'
        : 'Purged expired soft-deleted resources',
    );

    return NextResponse.json({
      message: 'Soft-deleted resource purge completed',
      purged: result.purged,
      heldFromPurge: result.heldFromPurge,
      skipped: result.skipped,
      failed: result.failed,
      tables: result.tables,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Soft-deleted resource purge cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
