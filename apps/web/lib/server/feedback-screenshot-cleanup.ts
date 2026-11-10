import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { deletePrivateObject, isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';

export const FEEDBACK_SCREENSHOT_SWEEP_GRACE_MINUTES = 60;

const MAX_SWEPT_PER_RUN = 200;

export const RECORD_FEEDBACK_SCREENSHOT_SQL = `insert into public.feedback_screenshot_cleanups (storage_key, user_id)
       values ($1, $2)`;

export const CLEAR_FEEDBACK_SCREENSHOT_SQL = `delete from public.feedback_screenshot_cleanups
        where storage_key = $1`;

export interface FeedbackScreenshotSweep {
  swept: number;
  failed: number;
  remaining: boolean;
}

export async function sweepAbandonedFeedbackScreenshots(
  db: DatabaseAdapter,
  limit = MAX_SWEPT_PER_RUN,
): Promise<FeedbackScreenshotSweep> {
  const due = await db.query<{ storage_key: string }>(
    `select storage_key
       from public.feedback_screenshot_cleanups
      where created_at < now() - make_interval(mins => $1)
      order by created_at
      limit $2`,
    [FEEDBACK_SCREENSHOT_SWEEP_GRACE_MINUTES, limit + 1],
  );
  const sweep: FeedbackScreenshotSweep = {
    swept: 0,
    failed: 0,
    remaining: due.length > limit,
  };
  if (due.length === 0) return sweep;
  if (!isPrivateObjectStorageConfigured()) {
    logger.warn(
      { count: Math.min(due.length, limit) },
      'Private object storage is not configured; abandoned feedback screenshots retained',
    );
    sweep.failed = Math.min(due.length, limit);
    return sweep;
  }

  for (const { storage_key: storageKey } of due.slice(0, limit)) {
    try {
      await deletePrivateObject(storageKey);
      await db.execute(CLEAR_FEEDBACK_SCREENSHOT_SQL, [storageKey]);
      sweep.swept += 1;
    } catch (error) {
      sweep.failed += 1;
      logger.error(
        { error, objectKey: storageKey },
        'Failed to sweep an abandoned feedback screenshot; it is retried on the next run',
      );
    }
  }
  return sweep;
}
