import 'server-only';

import { logger } from '@/lib/logger';

import {
  type AccountErasureReport,
  closeErasureTombstone,
  eraseProfileRow,
  eraseUserAccountData,
  openErasureTombstone,
} from './account-erasure';
import { getIdentityProvider } from './identity';
import { getNeonDb } from './neon-db';
import { invalidateAccountStatusCache } from './request-context-cache';

export type ScheduledErasureStage = 'tombstone' | 'erasure' | 'identity';

export type ScheduledErasureResult =
  | { status: 'purged'; resurrected: boolean }
  | { status: 'not_due' }
  | { status: 'failed'; stage: ScheduledErasureStage; detail: string };

export class ScheduledErasureError extends Error {
  constructor(
    readonly stage: ScheduledErasureStage,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduledErasureError';
  }
}

function incompleteStores(report: AccountErasureReport): string {
  const failures = Object.entries(report.tables)
    .filter(([table, outcome]) => table !== 'profiles' && !outcome.deleted && !outcome.skipped)
    .map(([table, outcome]) => `${table}${outcome.error ? ` (${outcome.error})` : ''}`);
  failures.push(
    ...Object.entries(report.anonymized ?? {})
      .filter(([, outcome]) => !outcome.updated && !outcome.skipped)
      .map(([table, outcome]) => `${table}${outcome.error ? ` (${outcome.error})` : ''}`),
  );
  for (const [store, count] of [
    ['media objects', report.mediaObjectsFailed],
    ['backup objects', report.backupObjectsFailed],
    ['knowledge objects', report.knowledgeObjectsFailed],
    ['avatar objects', report.avatarObjectsFailed],
    ['sandbox cache keys', report.cacheKeysFailed],
  ] as const) {
    if ((count ?? 0) > 0) failures.push(`${store} (${count} failed)`);
  }
  return failures.join(', ').slice(0, 500);
}

async function deleteProviderIdentity(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getIdentityProvider().deleteUser(userId);
    return { ok: true };
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
    if (/not\s*found|404/i.test(message)) return { ok: true };
    return { ok: false, error: message };
  }
}

async function isStillDue(userId: string): Promise<boolean> {
  const [row] = await getNeonDb().query<{ due: boolean }>(
    `select (deletion_scheduled_for is not null and deletion_scheduled_for <= now()) as due
       from public.profiles
      where id = $1
      limit 1`,
    [userId],
  );
  return row?.due === true;
}

async function profileExists(userId: string): Promise<boolean> {
  const [row] = await getNeonDb().query<{ id: string }>(
    `select id from public.profiles where id = $1 limit 1`,
    [userId],
  );
  return Boolean(row);
}

/**
 * The tombstone is opened before anything is deleted and settled after, so an
 * erasure interrupted halfway is visible as an open tombstone and swept again.
 */
async function erase(userId: string): Promise<void> {
  const tombstone = await openErasureTombstone(userId);
  // The gate caches the effective status for five minutes; an erased account must stop at once.
  await invalidateAccountStatusCache(userId);
  if (!tombstone.recorded && !tombstone.skipped) {
    throw new ScheduledErasureError(
      'tombstone',
      tombstone.error ?? 'The erasure tombstone could not be written',
    );
  }

  const report = await eraseUserAccountData(userId, { retainProfile: true });
  if (!report.complete) {
    throw new ScheduledErasureError(
      'erasure',
      `Account data was only partly erased: ${incompleteStores(report) || 'see the erasure report'}`,
    );
  }

  const settled = await closeErasureTombstone(userId);
  if (!settled.recorded && !settled.skipped) {
    logger.warn(
      { userId, error: settled.error },
      'Erasure tombstone left open; the sweep will settle it',
    );
  }

  const identity = await deleteProviderIdentity(userId);
  if (!identity.ok) throw new ScheduledErasureError('identity', identity.error);

  await eraseProfileRow(userId);
}

export async function eraseScheduledAccount(userId: string): Promise<ScheduledErasureResult> {
  if (!(await isStillDue(userId))) return { status: 'not_due' };
  try {
    await erase(userId);
  } catch (error) {
    if (error instanceof ScheduledErasureError) {
      return { status: 'failed', stage: error.stage, detail: error.message };
    }
    throw error;
  }
  logger.info({ userId }, 'Scheduled account deletion completed');
  return { status: 'purged', resurrected: false };
}

/**
 * A tombstoned subject whose rows came back (a restore, a replayed import) is
 * erased again. A profile row that is present means the account itself was
 * resurrected, which also has to lose its identity-provider user.
 */
export async function reEraseTombstonedAccount(userId: string): Promise<ScheduledErasureResult> {
  const resurrected = await profileExists(userId);
  try {
    if (resurrected) {
      await erase(userId);
    } else {
      const tombstone = await openErasureTombstone(userId);
      await invalidateAccountStatusCache(userId);
      if (!tombstone.recorded && !tombstone.skipped) {
        throw new ScheduledErasureError(
          'tombstone',
          tombstone.error ?? 'The erasure tombstone could not be advanced',
        );
      }
      const report = await eraseUserAccountData(userId, { retainProfile: true });
      if (!report.complete) {
        throw new ScheduledErasureError(
          'erasure',
          `Tombstoned account could not be fully re-erased: ${incompleteStores(report) || 'see the erasure report'}`,
        );
      }
      await closeErasureTombstone(userId);
    }
  } catch (error) {
    if (error instanceof ScheduledErasureError) {
      return { status: 'failed', stage: error.stage, detail: error.message };
    }
    throw error;
  }
  if (resurrected) {
    logger.warn({ userId }, 'Resurrected account re-erased from the suppression list');
  }
  return { status: 'purged', resurrected };
}
