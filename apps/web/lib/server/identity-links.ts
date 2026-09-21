import 'server-only';

import { subjectIsStoredUserId } from '@agiworkforce/identity';

import { getNeonDb } from '@/lib/server/neon-db';

export interface AccountIdentity {
  id: string;
  provider: string;
  creationSource: string;
  createdAt: string;
  lastAuthenticatedAt: string | null;
  /** False for the only remaining identity, and for the one the account is registered under. */
  removable: boolean;
}

export interface UnlinkedIdentity {
  provider: string;
  subject: string;
}

export type UnlinkOutcome =
  | { outcome: 'unlinked'; identity: UnlinkedIdentity }
  | { outcome: 'unknown' }
  | { outcome: 'last_sign_in_method' }
  | { outcome: 'primary_sign_in_method' };

const LIST = `
  select id::text as id,
         provider,
         subject,
         creation_source,
         created_at,
         last_authenticated_at
    from public.identities
   where user_id = $1
   order by created_at asc, id asc`;

const TARGET = `
  select provider, subject
    from public.identities
   where user_id = $1 and id = $2::uuid`;

/**
 * The locking CTE takes a row lock on every identity this account has, in id
 * order, so a second unlink blocks until the first commits and then counts the
 * rows that are left rather than the rows it saw when it started.
 */
const UNLINK = `
  with locked as materialized (
    select id
      from public.identities
     where user_id = $1
     order by id
       for update
  )
  delete from public.identities target
   where target.user_id = $1
     and target.id = $2::uuid
     and (select count(*) from locked) > 1
  returning target.provider, target.subject`;

const EXISTS = `
  select 1 as present
    from public.identities
   where user_id = $1 and id = $2::uuid`;

interface IdentityRow {
  id: string;
  provider: string;
  subject: string;
  creation_source: string;
  created_at: Date | string;
  last_authenticated_at: Date | string | null;
}

/**
 * Under a provider whose subject IS the stored account id, the resolver falls
 * back to that subject with no mapping row and links it again on the next
 * sign-in, so removing this row would be undone rather than honoured.
 */
function isPrimarySignInMethod(
  userId: string,
  row: { provider: string; subject: string },
): boolean {
  return subjectIsStoredUserId(row.provider) && row.subject === userId;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listAccountIdentities(userId: string): Promise<AccountIdentity[]> {
  const rows = await getNeonDb().query<IdentityRow>(LIST, [userId]);
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    creationSource: row.creation_source,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    lastAuthenticatedAt: toIso(row.last_authenticated_at),
    removable: rows.length > 1 && !isPrimarySignInMethod(userId, row),
  }));
}

export async function unlinkAccountIdentity(
  userId: string,
  identityId: string,
): Promise<UnlinkOutcome> {
  const db = getNeonDb();

  const [target] = await db.query<{ provider: string; subject: string }>(TARGET, [
    userId,
    identityId,
  ]);
  if (!target) return { outcome: 'unknown' };
  if (isPrimarySignInMethod(userId, target)) return { outcome: 'primary_sign_in_method' };

  const removed = await db.query<{ provider: string; subject: string }>(UNLINK, [
    userId,
    identityId,
  ]);
  const row = removed[0];
  if (row)
    return { outcome: 'unlinked', identity: { provider: row.provider, subject: row.subject } };

  const present = await db.query<{ present: number }>(EXISTS, [userId, identityId]);
  return present.length > 0 ? { outcome: 'last_sign_in_method' } : { outcome: 'unknown' };
}
