/**
 * Utility for detecting database / network unavailability errors.
 *
 * Covers the full set of Node.js network error codes that indicate a downstream
 * service (Supabase, PostgreSQL, etc.) is temporarily unreachable, rather than
 * only checking for the "fetch failed" message string.
 */
export function isDbUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes('fetch failed')) return true;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code ?? '';
    return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(code);
  }
  return false;
}
