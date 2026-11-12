export interface ExpiredPairingPrunerOptions {
  prune: (
    expiredBefore: number,
    limit: number,
    liveCodes: readonly string[],
  ) => Promise<{ data: number | null; error: unknown }>;
  live: () => readonly string[];
  intervalMs: number;
  graceMs: number;
  batch: number;
}

export type PruneOutcome =
  { kind: 'skipped' } | { kind: 'pruned'; deleted: number } | { kind: 'failed'; error: unknown };

/**
 * Deletes stored pairings that expired more than `graceMs` ago, at most once per
 * `intervalMs` and at most `batch` rows a pass. A pairing that was never scanned,
 * or that ended with a crash, otherwise stays in the store with its account id
 * and rotating credentials for good.
 */
export function createExpiredPairingPruner(
  options: ExpiredPairingPrunerOptions,
): (now: number) => Promise<PruneOutcome> {
  let lastRunAt: number | null = null;
  let running = false;
  return async (now: number) => {
    if (running || (lastRunAt !== null && now - lastRunAt < options.intervalMs)) {
      return { kind: 'skipped' };
    }
    running = true;
    lastRunAt = now;
    try {
      const { data, error } = await options.prune(
        now - options.graceMs,
        options.batch,
        options.live(),
      );
      if (error || data === null) return { kind: 'failed', error };
      return { kind: 'pruned', deleted: data };
    } catch (error) {
      return { kind: 'failed', error };
    } finally {
      running = false;
    }
  };
}
