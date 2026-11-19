import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const { writeArtifactStorageValue } = await import('../artifact-runtime-service');

const ARTIFACT = { publishedArtifactId: 'publication-1', ownerUserId: 'owner-1' };

function makeStore(seedBytes: number, isolation = 'read committed') {
  const committed = new Map<string, number>([['seed', seedBytes]]);
  const lockTails = new Map<string, Promise<void>>();

  function transactionAdapter(): { adapter: DatabaseAdapter; release: () => void } {
    const releases: Array<() => void> = [];
    const adapter = {
      async query(sql: string, params: unknown[]) {
        if (sql.includes('transaction_isolation')) return [{ isolation }];
        if (sql.includes('pg_advisory_xact_lock')) {
          const key = `${String(params[0])}:${String(params[1] ?? '')}`;
          const previous = lockTails.get(key) ?? Promise.resolve();
          let release!: () => void;
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          lockTails.set(
            key,
            previous.then(() => held),
          );
          releases.push(release);
          await previous;
          return [{ locked: true }];
        }
        const snapshot = [...committed.values()].reduce((sum, bytes) => sum + bytes, 0);
        await Promise.resolve();
        await Promise.resolve();
        const incoming =
          Buffer.byteLength(String(params[2])) + Buffer.byteLength(String(params[3]));
        const others = snapshot - (committed.get(String(params[2])) ?? 0);
        if (others + incoming > Number(params[5])) return [];
        committed.set(String(params[2]), incoming);
        return [{ storage_key: String(params[2]) }];
      },
    } as unknown as DatabaseAdapter;
    return { adapter, release: () => releases.forEach((release) => release()) };
  }

  const db = {
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      const { adapter, release } = transactionAdapter();
      try {
        return await fn(adapter);
      } finally {
        release();
      }
    },
  } as unknown as DatabaseAdapter;

  return { db, total: () => [...committed.values()].reduce((sum, bytes) => sum + bytes, 0) };
}

describe('writeArtifactStorageValue', () => {
  const MIB = 1024 * 1024;

  it('admits only the writes that fit when two writers race for the last of the allowance', async () => {
    const store = makeStore(ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES - 2 * MIB);
    const value = 'x'.repeat(Math.floor(1.5 * MIB));
    const outcomes = await Promise.all(
      ['a', 'b'].map((key) =>
        writeArtifactStorageValue(store.db, {
          artifact: ARTIFACT,
          userId: `viewer-${key}`,
          scope: 'shared',
          key,
          value,
        }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome === 'saved')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'over_limit')).toHaveLength(1);
    expect(store.total()).toBeLessThanOrEqual(ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES);
  });

  it('refuses to admit a write outside read committed isolation', async () => {
    const store = makeStore(0, 'serializable');
    await expect(
      writeArtifactStorageValue(store.db, {
        artifact: ARTIFACT,
        userId: 'viewer-a',
        scope: 'personal',
        key: 'a',
        value: 'v',
      }),
    ).rejects.toThrow('read committed');
  });
});
