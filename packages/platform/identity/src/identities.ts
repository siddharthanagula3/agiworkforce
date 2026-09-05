import type { IdentityProviderName } from './types';

export const IDENTITIES_TABLE = 'public.identities';

export interface IdentityRecordReader {
  query<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
}

/**
 * Providers whose subject string is itself the stored user id. Migrations 0019
 * and 0031 retired the old bridge table and wrote the Clerk subject straight
 * into `profiles.id` and every `user_id` column, so a lookup for Clerk would
 * ask the database to confirm what the caller already holds. A second provider
 * has no such history and resolves through the mapping row.
 */
const SUBJECT_IS_STORED_USER_ID: readonly IdentityProviderName[] = ['clerk'];

export function subjectIsStoredUserId(provider: string): boolean {
  return (SUBJECT_IS_STORED_USER_ID as readonly string[]).includes(provider);
}

/**
 * Resolves an authenticated (provider, subject) pair to this product's own user
 * id. The single place that mapping is read, so a provider swap remaps rows
 * instead of rewriting every table that carries a user id.
 */
export async function resolveInternalUserId(
  reader: IdentityRecordReader,
  provider: string,
  subject: string,
): Promise<string | null> {
  if (subjectIsStoredUserId(provider)) return subject;
  const rows = await reader.query<{ user_id: string }>(
    `select user_id from ${IDENTITIES_TABLE} where provider = $1 and subject = $2 limit 1`,
    [provider, subject],
  );
  return rows[0]?.user_id ?? null;
}
