import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const requeueReplicasAfterRestore = vi.hoisted(() => vi.fn(async () => 3));
vi.mock('./object-backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./object-backup')>()),
  resolveObjectBackupTarget: () => null,
  requeueReplicasAfterRestore,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ERASURE_LEDGER_KEY,
  ErasureLedgerUnavailableError,
  erasureLedgerDigest,
  isSafeToPromote,
  parseErasureLedger,
  readErasureLedger,
  recordErasureReplay,
  replayErasureTombstones,
  serializeErasureLedger,
  syncErasureLedger,
  type ErasureLedgerEntry,
} from './erasure-tombstones';

function entry(userId: string, erasedAt: string | null = '2026-08-01T00:00:00.000Z') {
  return { userId, openedAt: '2026-07-01T00:00:00.000Z', erasedAt };
}

function bucket(initial: string | null) {
  const objects = new Map<string, string>();
  if (initial !== null) objects.set(ERASURE_LEDGER_KEY, initial);

  const store = {
    get: vi.fn(async (_bucket: string, key: string) => {
      const text = objects.get(key);
      return text === undefined ? null : { data: new TextEncoder().encode(text) };
    }),
    put: vi.fn(async (input: { key: string; body: Uint8Array }) => {
      objects.set(input.key, new TextDecoder().decode(input.body));
    }),
    head: vi.fn(),
    getStream: vi.fn(),
    delete: vi.fn(),
    copyIfMatch: vi.fn(),
    presignPut: vi.fn(),
  };

  return {
    target: { store, bucket: 'backup', region: 'eu', endpoint: undefined } as never,
    store,
    read: () => objects.get(ERASURE_LEDGER_KEY) ?? null,
  };
}

function database(tombstones: Array<{ user_id: string; erased_at: string | null }>) {
  const inserts: unknown[][] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/from public\.erasure_tombstones/.test(sql)) {
        return tombstones.map((row) => ({
          user_id: row.user_id,
          last_swept_at: '2026-07-01T00:00:00.000Z',
          erased_at: row.erased_at,
        }));
      }
      if (/insert into public\.erasure_ledger_replays/.test(sql)) {
        inserts.push(params);
        return [{ id: 'replay-1' }];
      }
      return [];
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/insert into public\.erasure_tombstones/.test(sql)) inserts.push(params);
    }),
  } as unknown as DatabaseAdapter;
  return { db, inserts };
}

beforeEach(() => vi.clearAllMocks());

describe('ledger format', () => {
  it('round-trips and orders by subject so the digest is stable', () => {
    const entries = [entry('zoe'), entry('ann', null)];
    const text = serializeErasureLedger(entries);

    expect(parseErasureLedger(text)).toEqual([entry('ann', null), entry('zoe')]);
    expect(erasureLedgerDigest(entries)).toBe(erasureLedgerDigest([...entries].reverse()));
  });

  it('refuses a malformed line rather than dropping a subject', () => {
    expect(() => parseErasureLedger('{"userId":"ann","openedAt":"x"}\nnot json')).toThrow(
      ErasureLedgerUnavailableError,
    );
    expect(() => parseErasureLedger('{"openedAt":"x"}')).toThrow(/names no subject/);
  });
});

describe('reading the ledger fails closed', () => {
  it('refuses when the object backup is not configured', async () => {
    await expect(readErasureLedger()).rejects.toThrow(/not configured/);
  });

  it('refuses when the ledger object is absent', async () => {
    const backup = bucket(null);
    await expect(readErasureLedger({ target: backup.target })).rejects.toThrow(
      ErasureLedgerUnavailableError,
    );
  });

  it('reads an empty ledger as a real answer', async () => {
    const backup = bucket('');
    await expect(readErasureLedger({ target: backup.target })).resolves.toEqual([]);
  });
});

describe('syncErasureLedger', () => {
  it('mirrors a tombstone the ledger has never seen', async () => {
    const backup = bucket('');
    const { db } = database([{ user_id: 'ann', erased_at: '2026-08-01T00:00:00.000Z' }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.added).toEqual(['ann']);
    expect(report.written).toBe(true);
    expect(parseErasureLedger(backup.read() as string)).toEqual([
      entry('ann', '2026-08-01T00:00:00.000Z'),
    ]);
  });

  it('settles an entry when the erasure completes', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann', null)]));
    const { db } = database([{ user_id: 'ann', erased_at: '2026-08-02T00:00:00.000Z' }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.settled).toEqual(['ann']);
    expect(parseErasureLedger(backup.read() as string)[0]?.erasedAt).toBe(
      '2026-08-02T00:00:00.000Z',
    );
  });

  it('never downgrades a settled entry back to unerased', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([{ user_id: 'ann', erased_at: null }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.written).toBe(false);
    expect(parseErasureLedger(backup.read() as string)[0]?.erasedAt).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('keeps a ledger entry the database no longer has, which is the whole point', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([]);

    await syncErasureLedger(db, { target: backup.target });

    expect(parseErasureLedger(backup.read() as string)).toEqual([entry('ann')]);
  });

  it('re-arms the tombstone a restore rolled back, on the cron the sync already runs on', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db, inserts } = database([]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.reArmed).toEqual(['ann']);
    expect(inserts).toContainEqual(['ann', '2026-07-01T00:00:00.000Z']);
  });

  it('records the re-arming as evidence that the database had lost tombstones', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([]);

    const report = await syncErasureLedger(db, {
      target: backup.target,
      performedBy: 'restore-drill',
    });

    expect(report.replayId).toBe('replay-1');
    const recorded = vi
      .mocked(db.query)
      .mock.calls.find(([sql]) => /insert into public\.erasure_ledger_replays/.test(String(sql)));
    expect(recorded?.[1]).toEqual([
      null,
      'restore-drill',
      1,
      erasureLedgerDigest([entry('ann')]),
      1,
      0,
      0,
      JSON.stringify({ reArmed: ['ann'], pending: [], unledgered: [] }),
    ]);
  });

  it('marks every backup replica due again when the database had lost tombstones', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(requeueReplicasAfterRestore).toHaveBeenCalledTimes(1);
    expect(report.replicasRequeued).toBe(3);
  });

  it('leaves the replica record alone on a run that found nothing restored', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([{ user_id: 'ann', erased_at: '2026-08-01T00:00:00.000Z' }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(requeueReplicasAfterRestore).not.toHaveBeenCalled();
    expect(report.replicasRequeued).toBe(0);
  });

  it('writes no replay row on an ordinary run where nothing was lost', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([{ user_id: 'ann', erased_at: '2026-08-01T00:00:00.000Z' }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.reArmed).toEqual([]);
    expect(report.replayId).toBeNull();
    expect(
      vi
        .mocked(db.query)
        .mock.calls.some(([sql]) => /insert into public\.erasure_ledger_replays/.test(String(sql))),
    ).toBe(false);
  });

  it('does not re-arm a subject whose erasure this very run recorded', async () => {
    const backup = bucket(serializeErasureLedger([]));
    const { db, inserts } = database([{ user_id: 'new', erased_at: null }]);

    const report = await syncErasureLedger(db, { target: backup.target });

    expect(report.added).toEqual(['new']);
    expect(report.reArmed).toEqual([]);
    expect(inserts).toEqual([]);
  });
});

describe('replayErasureTombstones', () => {
  it('re-arms a tombstone the restore rolled back', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db, inserts } = database([]);

    const report = await replayErasureTombstones(db, { target: backup.target });

    expect(report.reArmed).toEqual(['ann']);
    expect(inserts[0]?.[0]).toBe('ann');
    expect(isSafeToPromote(report)).toBe(false);
  });

  it('re-arms with a null erasure time so the purge cron picks the subject up', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([]);

    await replayErasureTombstones(db, { target: backup.target });

    const statement = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(statement).toMatch(/values \(\$1, \$2, null\)/);
    expect(statement).toMatch(/do update set erased_at = null/);
  });

  it('leaves a restore made after the erasure alone', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([{ user_id: 'ann', erased_at: '2026-08-01T00:00:00.000Z' }]);

    const report = await replayErasureTombstones(db, { target: backup.target });

    expect(report.present).toEqual(['ann']);
    expect(report.reArmed).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
    expect(isSafeToPromote(report)).toBe(true);
  });

  it('holds promotion while an erasure is open, even though the tombstone survived', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann', null)]));
    const { db } = database([{ user_id: 'ann', erased_at: null }]);

    const report = await replayErasureTombstones(db, { target: backup.target });

    expect(report.pending).toEqual(['ann']);
    expect(isSafeToPromote(report)).toBe(false);
  });

  it('keeps a restored tombstone the ledger lagged behind on, and says so', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db } = database([
      { user_id: 'ann', erased_at: '2026-08-01T00:00:00.000Z' },
      { user_id: 'bo', erased_at: '2026-08-03T00:00:00.000Z' },
    ]);

    const report = await replayErasureTombstones(db, { target: backup.target });

    expect(report.unledgered).toEqual(['bo']);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('refuses to run at all when the ledger cannot be read', async () => {
    const backup = bucket(null);
    const { db } = database([]);

    await expect(replayErasureTombstones(db, { target: backup.target })).rejects.toThrow(
      ErasureLedgerUnavailableError,
    );
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('recordErasureReplay', () => {
  it('stores the digest of the ledger it read, with the counts', async () => {
    const backup = bucket(serializeErasureLedger([entry('ann')]));
    const { db, inserts } = database([]);
    const report = await replayErasureTombstones(db, { target: backup.target });

    const id = await recordErasureReplay(db, {
      restorePoint: '2026-07-15T00:00:00.000Z',
      performedBy: 'oncall',
      report,
    });

    expect(id).toBe('replay-1');
    const params = inserts.at(-1) as unknown[];
    expect(params[1]).toBe('oncall');
    expect(params[3]).toBe(erasureLedgerDigest([entry('ann') as ErasureLedgerEntry]));
    expect(params[4]).toBe(1);
  });
});
