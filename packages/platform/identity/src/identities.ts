import type { IdentityProviderName } from './types';

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
