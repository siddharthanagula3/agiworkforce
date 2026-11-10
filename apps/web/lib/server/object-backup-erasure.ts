import 'server-only';

import { logger } from '@/lib/logger';
import {
  deleteBackupObject,
  forgetBackupReplicas,
  resolveObjectBackupTarget,
} from '@/lib/server/object-backup';

/**
 * The backup bucket is a copy of what existed, and an erasure that stops at the
 * primary leaves the subject's objects restorable from it. The hourly
 * reconciliation would reach them eventually; an erasure request cannot wait
 * for a round of a round-robin sweep, so the copies go with the originals.
 */
export async function eraseBackupCopies(
  keys: ReadonlyArray<string>,
): Promise<{ deleted: number; failedKeys: string[] }> {
  if (keys.length === 0) return { deleted: 0, failedKeys: [] };
  const target = resolveObjectBackupTarget();
  if (!target) return { deleted: 0, failedKeys: [] };

  const removed: string[] = [];
  const failedKeys: string[] = [];
  for (const key of keys) {
    try {
      const outcome = await deleteBackupObject(key, { target });
      if (outcome === 'deleted') removed.push(key);
      else if (outcome === 'absent') removed.push(key);
    } catch (error) {
      failedKeys.push(key);
      logger.warn(
        { error, failedSoFar: failedKeys.length },
        'Failed to delete the backup copy of an erased object; the caller receives its key',
      );
    }
  }

  try {
    await forgetBackupReplicas(removed);
  } catch (error) {
    logger.warn({ error }, 'Backup replica records outlived the objects they tracked');
  }

  return { deleted: removed.length, failedKeys };
}
