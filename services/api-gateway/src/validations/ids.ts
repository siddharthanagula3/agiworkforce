const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate a RFC 4122 UUID string before using it in ownership lookups.
 */
export function isValidUuid(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}
