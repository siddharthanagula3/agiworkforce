import { describe, expect, it, vi } from 'vitest';

import {
  EXPIRED_PAIRING_PRUNE_BATCH,
  EXPIRED_PAIRING_PRUNE_GRACE_MS,
  EXPIRED_PAIRING_PRUNE_INTERVAL_MS,
} from '../src/constants.js';
import { createExpiredPairingPruner } from '../src/expired-pairings.js';

interface Row {
  code: string;
  expires_at: number;
}

function storeWith(rows: Row[]) {
  const stored = new Map(rows.map((row) => [row.code, row]));
  const prune = vi.fn(
    async (expiredBefore: number, limit: number, liveCodes: readonly string[]) => {
      const doomed = [...stored.values()]
        .filter((row) => row.expires_at < expiredBefore && !liveCodes.includes(row.code))
        .slice(0, limit);
      for (const row of doomed) stored.delete(row.code);
      return { data: doomed.length, error: null };
    },
  );
  return { stored, prune };
}

function pruner(
  prune: Parameters<typeof createExpiredPairingPruner>[0]['prune'],
  live: () => readonly string[] = () => [],
) {
  return createExpiredPairingPruner({
    prune,
    live,
    intervalMs: EXPIRED_PAIRING_PRUNE_INTERVAL_MS,
    graceMs: EXPIRED_PAIRING_PRUNE_GRACE_MS,
    batch: EXPIRED_PAIRING_PRUNE_BATCH,
  });
}

describe('pruning expired pairings', () => {
  const now = 1_800_000_000_000;

  it('deletes a pairing that expired past the grace period on the first tick', async () => {
    const { stored, prune } = storeWith([
      { code: 'LONGEXPIRED1', expires_at: now - EXPIRED_PAIRING_PRUNE_GRACE_MS - 1 },
      { code: 'JUSTEXPIRED1', expires_at: now - 1 },
      { code: 'STILLLIVE001', expires_at: now + 60_000 },
    ]);

    expect(await pruner(prune)(now)).toEqual({ kind: 'pruned', deleted: 1 });
    expect([...stored.keys()].sort()).toEqual(['JUSTEXPIRED1', 'STILLLIVE001']);
    expect(prune).toHaveBeenCalledWith(
      now - EXPIRED_PAIRING_PRUNE_GRACE_MS,
      EXPIRED_PAIRING_PRUNE_BATCH,
      [],
    );
  });

  it('keeps a pairing this process still serves even when its stored expiry lapsed', async () => {
    const { stored, prune } = storeWith([
      { code: 'SERVEDHERE01', expires_at: now - EXPIRED_PAIRING_PRUNE_GRACE_MS - 60_000 },
      { code: 'ABANDONED001', expires_at: now - EXPIRED_PAIRING_PRUNE_GRACE_MS - 60_000 },
    ]);

    expect(await pruner(prune, () => ['SERVEDHERE01'])(now)).toEqual({
      kind: 'pruned',
      deleted: 1,
    });
    expect([...stored.keys()]).toEqual(['SERVEDHERE01']);
  });

  it('runs at most once per interval', async () => {
    const { prune } = storeWith([]);
    const tick = pruner(prune);
    await tick(now);
    expect(await tick(now + EXPIRED_PAIRING_PRUNE_INTERVAL_MS - 1)).toEqual({ kind: 'skipped' });
    await tick(now + EXPIRED_PAIRING_PRUNE_INTERVAL_MS);
    expect(prune).toHaveBeenCalledTimes(2);
  });

  it('reports a store failure instead of claiming the rows went', async () => {
    const failure = { message: 'store unavailable' };
    const tick = pruner(async () => ({ data: null, error: failure }));
    expect(await tick(now)).toEqual({ kind: 'failed', error: failure });
  });
});
