import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

import { resolveObjectBackupTarget, type BackupTarget } from './object-backup';

/**
 * The ledger lives in the backup bucket, not in Postgres. A Neon point-in-time
 * restore rolls erasure_tombstones back with the data it protects, so a record
 * kept inside the same database cannot say what was erased before the restore.
 */
export const ERASURE_LEDGER_KEY = 'erasure-ledger/tombstones.ndjson';

const TOMBSTONE_TABLE = 'erasure_tombstones';

export interface ErasureLedgerEntry {
  userId: string;
  openedAt: string;
  erasedAt: string | null;
}

export class ErasureLedgerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErasureLedgerUnavailableError';
  }
}

function sortEntries(entries: ErasureLedgerEntry[]): ErasureLedgerEntry[] {
  return [...entries].sort((a, b) => a.userId.localeCompare(b.userId));
}

export function serializeErasureLedger(entries: ErasureLedgerEntry[]): string {
  return sortEntries(entries)
    .map((entry) => JSON.stringify(entry))
    .join('\n');
}

/**
 * A malformed line throws rather than being skipped: a ledger that silently
 * drops entries under-reports what was erased, which is the failure mode this
 * whole path exists to prevent.
 */
export function parseErasureLedger(text: string): ErasureLedgerEntry[] {
  const entries: ErasureLedgerEntry[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ErasureLedgerUnavailableError(`Erasure ledger line ${index + 1} is not JSON`);
    }
    const entry = parsed as Partial<ErasureLedgerEntry>;
    if (typeof entry.userId !== 'string' || entry.userId.length === 0) {
      throw new ErasureLedgerUnavailableError(`Erasure ledger line ${index + 1} names no subject`);
    }
    if (typeof entry.openedAt !== 'string') {
      throw new ErasureLedgerUnavailableError(`Erasure ledger line ${index + 1} has no open time`);
    }
    entries.push({
      userId: entry.userId,
      openedAt: entry.openedAt,
      erasedAt: typeof entry.erasedAt === 'string' ? entry.erasedAt : null,
    });
  }
  return entries;
}

export function erasureLedgerDigest(entries: ErasureLedgerEntry[]): string {
  return createHash('sha256').update(serializeErasureLedger(entries)).digest('hex');
}

interface LedgerOptions {
  target?: BackupTarget | null;
}

function requireTarget(options: LedgerOptions): BackupTarget {
  const target = options.target === undefined ? resolveObjectBackupTarget() : options.target;
  if (!target) {
    throw new ErasureLedgerUnavailableError(
      'The object backup is not configured, so the erasure ledger cannot be read or written.',
    );
  }
  return target;
}

/**
 * An absent ledger object throws. "Never written" and "lost with the bucket"
 * look identical from here, and promoting a restored database on the strength
 * of the second one resurrects erased accounts.
 */
export async function readErasureLedger(
  options: LedgerOptions = {},
): Promise<ErasureLedgerEntry[]> {
  const target = requireTarget(options);
  const stored = await target.store.get(target.bucket, ERASURE_LEDGER_KEY);
  if (!stored) {
    throw new ErasureLedgerUnavailableError(
      `No erasure ledger at ${ERASURE_LEDGER_KEY} in ${target.bucket}.`,
    );
  }
  return parseErasureLedger(new TextDecoder().decode(stored.data));
}

export async function writeErasureLedger(
  entries: ErasureLedgerEntry[],
  options: LedgerOptions = {},
): Promise<void> {
  const target = requireTarget(options);
  await target.store.put({
    bucket: target.bucket,
    key: ERASURE_LEDGER_KEY,
    body: new TextEncoder().encode(serializeErasureLedger(entries)),
    contentType: 'application/x-ndjson',
  });
}

interface TombstoneRow {
  user_id: string;
  last_swept_at: string | Date;
  erased_at: string | Date | null;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

async function readTombstones(db: DatabaseAdapter): Promise<ErasureLedgerEntry[]> {
  const rows = await db.query<TombstoneRow>(
    `select user_id, last_swept_at, erased_at from public.${TOMBSTONE_TABLE}`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    openedAt: toIso(row.last_swept_at) ?? new Date(0).toISOString(),
    erasedAt: toIso(row.erased_at),
  }));
}

export interface ErasureLedgerSyncReport {
  tombstones: number;
  ledgerEntries: number;
  added: string[];
  settled: string[];
  written: boolean;
}

/**
 * Mirrors the tombstone table into the backup bucket. Runs on the same cadence
 * as the purge cron, so the exposure window is one run: a subject erased after
 * the last sync and before a restore is not in the ledger.
 */
export async function syncErasureLedger(
  db: DatabaseAdapter,
  options: LedgerOptions = {},
): Promise<ErasureLedgerSyncReport> {
  const target = requireTarget(options);
  const tombstones = await readTombstones(db);

  let ledger: ErasureLedgerEntry[] = [];
  const stored = await target.store.get(target.bucket, ERASURE_LEDGER_KEY);
  if (stored) ledger = parseErasureLedger(new TextDecoder().decode(stored.data));

  const known = new Map(ledger.map((entry) => [entry.userId, entry]));
  const added: string[] = [];
  const settled: string[] = [];

  for (const tombstone of tombstones) {
    const existing = known.get(tombstone.userId);
    if (!existing) {
      known.set(tombstone.userId, tombstone);
      added.push(tombstone.userId);
      continue;
    }
    // An erasure only ever completes, so erasedAt goes from null to a time and
    // never back. A ledger entry is never downgraded by a sync.
    if (existing.erasedAt === null && tombstone.erasedAt !== null) {
      known.set(tombstone.userId, { ...existing, erasedAt: tombstone.erasedAt });
      settled.push(tombstone.userId);
    }
  }

  const merged = sortEntries([...known.values()]);
  const changed = added.length > 0 || settled.length > 0;
  if (changed) await writeErasureLedger(merged, { target });

  return {
    tombstones: tombstones.length,
    ledgerEntries: merged.length,
    added,
    settled,
    written: changed,
  };
}

export interface ErasureReplayReport {
  ledgerEntries: number;
  present: string[];
  reArmed: string[];
  pending: string[];
  unledgered: string[];
  ledgerDigest: string;
}

/**
 * The post-restore step. Re-arms every tombstone the restore rolled back so the
 * purge cron erases those subjects again before the database serves traffic.
 */
export async function replayErasureTombstones(
  db: DatabaseAdapter,
  options: LedgerOptions = {},
): Promise<ErasureReplayReport> {
  const ledger = await readErasureLedger(options);
  const restored = new Map((await readTombstones(db)).map((entry) => [entry.userId, entry]));

  const present: string[] = [];
  const reArmed: string[] = [];
  const pending: string[] = [];

  for (const entry of ledger) {
    const row = restored.get(entry.userId);
    if (!row) {
      await db.execute(
        `insert into public.${TOMBSTONE_TABLE} (user_id, last_swept_at, erased_at)
         values ($1, $2, null)
         on conflict (user_id) do update set erased_at = null`,
        [entry.userId, entry.openedAt],
      );
      reArmed.push(entry.userId);
      continue;
    }
    if (row.erasedAt === null) pending.push(entry.userId);
    else present.push(entry.userId);
  }

  const unledgered = [...restored.keys()].filter(
    (userId) => !ledger.some((entry) => entry.userId === userId),
  );

  if (reArmed.length > 0 || pending.length > 0) {
    logger.warn(
      { reArmed: reArmed.length, pending: pending.length },
      '[erasure-replay] the restore resurrected erased subjects; run the purge cron before serving',
    );
  }

  return {
    ledgerEntries: ledger.length,
    present,
    reArmed,
    pending,
    unledgered,
    ledgerDigest: erasureLedgerDigest(ledger),
  };
}

export interface ErasureReplayRecord extends ErasureReplayReport {
  id: string;
}

/**
 * Records the replay so the restore drill has evidence. Runs on the privileged
 * connection, like every other read of the suppression list.
 */
export async function recordErasureReplay(
  db: DatabaseAdapter,
  input: {
    restorePoint: string | null;
    performedBy: string;
    report: ErasureReplayReport;
  },
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into public.erasure_ledger_replays
       (restore_point, performed_by, ledger_entries, ledger_digest, re_armed, pending,
        unledgered, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id`,
    [
      input.restorePoint,
      input.performedBy,
      input.report.ledgerEntries,
      input.report.ledgerDigest,
      input.report.reArmed.length,
      input.report.pending.length,
      input.report.unledgered.length,
      JSON.stringify({
        reArmed: input.report.reArmed,
        pending: input.report.pending,
        unledgered: input.report.unledgered,
      }),
    ],
  );
  return row?.id ?? '';
}

/**
 * True when the restored database may serve traffic. A restore that resurrected
 * a subject stays closed until the purge cron has re-erased them.
 */
export function isSafeToPromote(report: ErasureReplayReport): boolean {
  return report.reArmed.length === 0 && report.pending.length === 0;
}
