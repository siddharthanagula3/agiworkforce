import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  ACCOUNT_STATUSES,
  accountAccessDecision,
  effectiveAccountStatus,
  type AccountAccessDecision,
  type AccountStatus,
} from './account-status';

// Erasure deletes the profile row, hence the tombstone join; the synthesised
// subject row makes "no row" mean the database did not answer.
const ACCOUNT_LIFECYCLE = `
  select profile.account_status,
         profile.deletion_scheduled_for,
         (tombstone.user_id is not null) as erased
    from (select $1::text as id) subject
    left join public.profiles profile on profile.id = subject.id
    left join public.erasure_tombstones tombstone on tombstone.user_id = subject.id`;

interface AccountLifecycleRow {
  account_status: string | null;
  deletion_scheduled_for: unknown;
  erased: boolean | null;
}

export async function readAccountStatus(userId: string): Promise<AccountStatus | null> {
  const rows = await getNeonDb().query<AccountLifecycleRow>(ACCOUNT_LIFECYCLE, [userId]);
  const row = rows[0];
  if (!row) throw new Error('account lifecycle lookup returned no row');
  return effectiveAccountStatus({
    status: row.account_status,
    deletionScheduled: row.deletion_scheduled_for != null,
    erased: row.erased === true,
  });
}

// A failed lookup states nothing: the route gate is the fail-closed layer, and
// guessing here would only replace its reason with a wrong one.
export async function accountAccessForSignIn(userId: string): Promise<AccountAccessDecision> {
  try {
    return accountAccessDecision(await readAccountStatus(userId));
  } catch (err) {
    logger.error({ err, userId }, 'account lifecycle lookup failed at sign-in completion');
    return { allowed: true };
  }
}

// An unattended run has nobody to refuse at sign-in, so the refusing statuses are read from
// the account vocabulary: a status added there cannot keep spending on a shut account.
export const UNATTENDED_RUN_DENIED_STATUSES: string[] = ACCOUNT_STATUSES.filter(
  (status) => !accountAccessDecision(status).allowed,
);

/** The same decision as a set predicate, for a statement that claims work for many owners at once. */
export function ownerMayRunUnattendedSql(ownerColumn: string, deniedStatusesParam: number): string {
  return `not exists (
         select 1 from public.profiles profile
          where profile.id = ${ownerColumn}
            and profile.account_status = any($${deniedStatusesParam}::text[])
       )
       and not exists (
         select 1 from public.erasure_tombstones tombstone
          where tombstone.user_id = ${ownerColumn}
       )`;
}
