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
