import 'server-only';

const PG_UNDEFINED_COLUMN = '42703';
const PG_UNDEFINED_TABLE = '42P01';

/**
 * True when the failure is migration 0133 not having been applied yet:
 * device_refresh_tokens exists but has no device_id column to join on.
 * Anything else is a real error and must not be swallowed.
 */
export function isCredentialLinkMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = record['code'];
  if (code === PG_UNDEFINED_COLUMN || code === PG_UNDEFINED_TABLE) return true;
  const message = String(record['message'] ?? '');
  return /device_id|device_refresh_tokens/.test(message) && /does not exist/.test(message);
}
