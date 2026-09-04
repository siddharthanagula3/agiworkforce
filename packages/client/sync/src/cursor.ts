export function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export function maxCursor(base: string, ...versions: string[]): string {
  let max = base;
  for (const v of versions) if (v && bigintGreater(v, max)) max = v;
  return max;
}

/**
 * Advance the pull cursor to the server-provided SAFE frontier only, never
 * recompute it from the max of per-row server_versions. The server bounds the
 * cursor to the slower-paginating table's frontier; overshooting via a
 * per-row max would skip that table's in-gap rows on the next pull and lose
 * them permanently. Pure + unit-tested so this safety-critical choice can't
 * silently regress inside either engine's I/O-bound, hard-to-test
 * orchestrator (mobile's `pull()`; desktop's `sync_now_inner`).
 *
 * A missing/empty `responseCursor` (schema-optional on some legacy callers,
 * always present on the current wire contract) is a no-op, the cursor never
 * moves backwards.
 */
export function selectNextCursor(
  current: string,
  responseCursor: string | null | undefined,
): string {
  return responseCursor ? maxCursor(current, responseCursor) : current;
}
