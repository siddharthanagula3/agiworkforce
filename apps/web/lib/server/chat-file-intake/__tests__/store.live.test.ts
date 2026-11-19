// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type KeyValueModule = typeof import('@/lib/server/key-value');
type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
  recordGeneratedArtifactBytes: vi.fn(),
}));

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { failStalledPreparations, preparationInProgress } from '@/lib/server/chat-file-preparation';
import { getKeyValueStore } from '@/lib/server/key-value';
import { insertScannedChatFileMediaAsset } from '@/lib/server/media-assets';
import {
  addScanBudgetWait,
  cancelIntakeByStagingKey,
  claimIntakeState,
  completeSealing,
  countInFlightIntakes,
  endIntake,
  hasOtherScanningIntake,
  insertIntake,
  intakeLeaseUntil,
  listIdleAwaitingPartsIntakes,
  listPrunableUnsealedSealingIntakes,
  listRedispatchableIntakes,
  listSealedIntakesWithIdlePreparation,
  listStalledIntakes,
  listUnpurgedTerminalIntakes,
  markIntakeObjectsPurged,
  markUploaded,
  pruneTerminalIntakes,
  readIntakeStatus,
  recordInspectedEtag,
  recordScanAttempt,
  refundIntakeDailyBytes,
  renewIntakeLease,
  returnSealingToScanning,
  sumInFlightIntakeBytes,
  touchPartRequest,
  type InsertIntakeInput,
} from '../store';

const connectionString = process.env['AGI_CHAT_FILE_INTAKE_TEST_DATABASE_URL'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
if (connectionString) {
  const address = new URL(connectionString);
  if (!LOCAL_HOSTS.has(address.hostname) || !/^\/[a-z0-9_]+_test$/.test(address.pathname)) {
    throw new Error(
      'The chat file intake fixture runs only against a local database whose name ends in _test.',
    );
  }
}

const OWNER = 'chat-file-owner';
const SUSPENDED = 'chat-file-suspended';
const MIB = 1024 * 1024;
const NOW = Date.parse('2026-11-15T09:00:00.000Z');
const DAY_KEY = `agi:chat-files:daily-bytes:${OWNER}:2026-11-15`;
const SHA = 'e'.repeat(64);

class RolledBack extends Error {}

let db: DatabaseAdapter;
let migrationBody: string;
let kv: KeyValueStore;

async function inRolledBackMigration(work: (tx: DatabaseAdapter) => Promise<void>): Promise<void> {
  await expect(
    db.transaction(async (tx) => {
      await tx.execute(`insert into public.profiles (id) values ($1), ($2)`, [OWNER, SUSPENDED]);
      await tx.execute(migrationBody);
      await work(tx);
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
}

function intakeInput(name: string, overrides: Partial<InsertIntakeInput> = {}): InsertIntakeInput {
  return {
    userId: OWNER,
    organizationId: null,
    conversationId: null,
    temporaryChat: false,
    fileName: `${name}.pdf`,
    mimeType: 'application/pdf',
    byteCount: 40 * MIB,
    declaredSha256: SHA.toUpperCase(),
    stagingKey: `chat-attachments/${OWNER}/1731000000000_${name}.pdf`,
    multipartUploadId: `upload-${name}`,
    partBytes: 8 * MIB,
    dailyBytesCharged: 40 * MIB,
    nowMs: NOW,
    ...overrides,
  };
}

async function uploadedIntake(tx: DatabaseAdapter, name: string, nowMs = NOW) {
  const inserted = await insertIntake(tx, intakeInput(name, { nowMs }));
  const uploaded = await markUploaded(tx, {
    userId: OWNER,
    stagingKey: inserted.stagingKey,
    nowMs,
  });
  if (!uploaded) throw new Error('markUploaded matched nothing');
  return uploaded;
}

async function sealedIntake(tx: DatabaseAdapter, name: string) {
  const row = await uploadedIntake(tx, name);
  for (const [to, from] of [
    ['inspecting', ['uploaded']],
    ['scanning', ['inspecting']],
    ['sealing', ['scanning']],
  ] as const) {
    await claimIntakeState(tx, {
      userId: OWNER,
      intakeId: row.id,
      runId: 'r',
      to,
      from,
      nowMs: NOW,
    });
  }
  const assetId = await insertScannedChatFileMediaAsset(
    {
      userId: OWNER,
      organizationId: null,
      kind: 'file',
      mimeType: 'application/pdf',
      byteSize: 40 * MIB,
      storagePathname: `${row.stagingKey}.scanned`,
      conversationId: null,
      temporaryChat: false,
      scannedSha256: createHash('sha256').update(name).digest('hex'),
      metadata: { source: 'chat-attachment' },
    },
    tx,
  );
  const sealed = await completeSealing(tx, {
    userId: OWNER,
    intakeId: row.id,
    runId: 'r',
    mediaAssetId: assetId,
    nowMs: NOW,
  });
  if (!sealed) throw new Error('completeSealing matched nothing');
  return { id: row.id, assetId };
}

// llm-guardrail-allow: requires a local disposable _test database; every case applies 0422 inside a transaction it rolls back.
describe.skipIf(!connectionString)('chat file intake statements against PostgreSQL', () => {
  beforeAll(async () => {
    db = createDatabaseClient({
      provider: 'postgres',
      connectionString: connectionString!,
      poolSize: 1,
      statementTimeoutMs: 30_000,
    });
    const migration = await readFile(
      new URL('../../../../db/neon/0422_chat_file_intakes.sql', import.meta.url),
      'utf8',
    );
    migrationBody = migration.replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    const [applied] = await db.query<{ present: boolean }>(
      `select to_regclass('public.chat_file_intakes') is not null as present`,
    );
    if (applied?.present) {
      throw new Error('0422 is already applied to this database; the fixture needs it absent.');
    }
  });

  afterAll(async () => {
    await db?.dispose();
  });

  beforeEach(() => {
    kv = createMemoryKeyValueStore();
    vi.mocked(getKeyValueStore).mockReturnValue(kv);
  });

  it('creates an intake, counts it in flight and moves it to uploaded with a lease', async () => {
    await inRolledBackMigration(async (tx) => {
      const inserted = await insertIntake(tx, intakeInput('a'));
      expect(inserted).toMatchObject({
        state: 'awaiting_parts',
        declaredSha256: SHA,
        byteCount: 40 * MIB,
        lastPartRequestAt: NOW,
        createdAt: NOW,
      });
      await insertIntake(tx, intakeInput('temp', { temporaryChat: true }));
      expect(await countInFlightIntakes(tx, { userId: OWNER })).toBe(2);
      expect(await sumInFlightIntakeBytes(tx, { userId: OWNER, organizationId: null })).toBe(
        40 * MIB,
      );
      expect(
        await touchPartRequest(tx, {
          userId: OWNER,
          stagingKey: inserted.stagingKey,
          nowMs: NOW + 5,
        }),
      ).toBe(true);
      const uploaded = await markUploaded(tx, {
        userId: OWNER,
        stagingKey: inserted.stagingKey,
        nowMs: NOW + 10,
      });
      expect(uploaded).toMatchObject({
        state: 'uploaded',
        leaseUntil: intakeLeaseUntil('uploaded', NOW + 10),
        lastPartRequestAt: NOW + 5,
      });
      expect(
        await touchPartRequest(tx, { userId: OWNER, stagingKey: inserted.stagingKey, nowMs: NOW }),
      ).toBe(false);
      expect(await readIntakeStatus(tx, { userId: SUSPENDED, intakeId: inserted.id })).toBeNull();
    });
  });

  it('lets one run hold a step, and another only after the lease has passed', async () => {
    await inRolledBackMigration(async (tx) => {
      const row = await uploadedIntake(tx, 'b');
      const claim = (runId: string, nowMs: number) =>
        claimIntakeState(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId,
          to: 'inspecting',
          from: ['uploaded'],
          nowMs,
        });

      expect(await claim('run-a', NOW)).toMatchObject({
        state: 'inspecting',
        workflowRunId: 'run-a',
      });
      expect(await claim('run-b', NOW + 1)).toBeNull();
      expect(await claim('run-a', NOW + 2)).toMatchObject({ workflowRunId: 'run-a' });
      const lease = intakeLeaseUntil('inspecting', NOW + 2);
      expect(await claim('run-b', lease)).toBeNull();
      expect(await claim('run-b', lease + 1)).toMatchObject({ workflowRunId: 'run-b' });
      expect(
        await renewIntakeLease(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'run-a',
          state: 'inspecting',
          nowMs: NOW,
        }),
      ).toBeNull();
      expect(
        await recordInspectedEtag(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'run-b',
          etag: '"e1"',
        }),
      ).toMatchObject({
        etag: '"e1"',
      });
    });
  });

  it('stamps the first submit once, counts attempts by compare-and-set and caps the budget wait', async () => {
    await inRolledBackMigration(async (tx) => {
      const row = await uploadedIntake(tx, 'c');
      await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'inspecting',
        from: ['uploaded'],
        nowMs: NOW,
      });
      const scanning = await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'scanning',
        from: ['inspecting'],
        nowMs: NOW + 1_000,
      });
      expect(scanning).toMatchObject({ state: 'scanning', firstSubmittedAt: NOW + 1_000 });
      const again = await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'scanning',
        from: [],
        nowMs: NOW + 9_000,
      });
      expect(again?.firstSubmittedAt).toBe(NOW + 1_000);
      expect(again?.stateChangedAt).toBe(NOW + 1_000);

      expect(
        await recordScanAttempt(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'r',
          attemptsBefore: 0,
          jobId: `${row.id}:1`,
        }),
      ).toMatchObject({ attempts: 1, scanJobId: `${row.id}:1` });
      expect(
        await recordScanAttempt(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'r',
          attemptsBefore: 0,
          jobId: 'dup',
        }),
      ).toBeNull();
      await addScanBudgetWait(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        waitMs: 5_000_000,
        capMs: 7_200_000,
      });
      const capped = await addScanBudgetWait(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        waitMs: 5_000_000,
        capMs: 7_200_000,
      });
      expect(capped?.scanBudgetWaitMs).toBe(7_200_000);
      expect(await hasOtherScanningIntake(tx, { userId: OWNER, intakeId: row.id })).toBe(false);
      const other = await uploadedIntake(tx, 'c2');
      expect(await hasOtherScanningIntake(tx, { userId: OWNER, intakeId: other.id })).toBe(true);
    });
  });

  it('seals with the scanned media row in one go, and refuses a run that no longer holds it', async () => {
    await inRolledBackMigration(async (tx) => {
      const row = await uploadedIntake(tx, 'd');
      for (const [to, from] of [
        ['inspecting', ['uploaded']],
        ['scanning', ['inspecting']],
        ['sealing', ['scanning']],
      ] as const) {
        await claimIntakeState(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'r',
          to,
          from,
          nowMs: NOW,
        });
      }
      const back = await returnSealingToScanning(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        nowMs: NOW + 1,
      });
      expect(back?.state).toBe('scanning');
      const sealing = await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'sealing',
        from: ['scanning'],
        nowMs: NOW + 2,
      });
      expect(sealing?.sealingEnteredAt).toBe(NOW);

      const assetId = await insertScannedChatFileMediaAsset(
        {
          userId: OWNER,
          organizationId: null,
          kind: 'file',
          mimeType: 'application/pdf',
          byteSize: 40 * MIB,
          storagePathname: `${row.stagingKey}.scanned`,
          conversationId: null,
          temporaryChat: false,
          scannedSha256: SHA,
          metadata: { source: 'chat-attachment' },
        },
        tx,
      );
      expect(
        await completeSealing(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'other',
          mediaAssetId: assetId,
          nowMs: NOW,
        }),
      ).toBeNull();
      expect(
        await completeSealing(tx, {
          userId: OWNER,
          intakeId: row.id,
          runId: 'r',
          mediaAssetId: assetId,
          nowMs: NOW + 3,
        }),
      ).toMatchObject({ state: 'sealed', mediaAssetId: assetId, leaseUntil: null });
      const [media] = await tx.query<{ scanned_sha256: string; content_sha256: string }>(
        `select scanned_sha256, content_sha256 from public.media_assets where id = $1::uuid`,
        [assetId],
      );
      expect(media).toEqual({ scanned_sha256: SHA, content_sha256: SHA });
    });
  });

  it('matches nothing when a statement keyed by intake id names another owner', async () => {
    await kv.increment(DAY_KEY, 40 * MIB);
    await inRolledBackMigration(async (tx) => {
      const row = await uploadedIntake(tx, 'owner');
      const other = { userId: SUSPENDED, intakeId: row.id };
      const run = { ...other, runId: 'r' };

      expect(await readIntakeStatus(tx, other)).toBeNull();
      expect(
        await claimIntakeState(tx, { ...run, to: 'inspecting', from: ['uploaded'], nowMs: NOW }),
      ).toBeNull();
      await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'inspecting',
        from: ['uploaded'],
        nowMs: NOW,
      });
      expect(
        await renewIntakeLease(tx, { ...run, state: 'inspecting', nowMs: NOW + 1 }),
      ).toBeNull();
      expect(await recordInspectedEtag(tx, { ...run, etag: '"x"' })).toBeNull();
      await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'scanning',
        from: ['inspecting'],
        nowMs: NOW,
      });
      expect(await recordScanAttempt(tx, { ...run, attemptsBefore: 0, jobId: 'j' })).toBeNull();
      expect(await addScanBudgetWait(tx, { ...run, waitMs: 1_000, capMs: 2_000 })).toBeNull();
      await claimIntakeState(tx, {
        userId: OWNER,
        intakeId: row.id,
        runId: 'r',
        to: 'sealing',
        from: ['scanning'],
        nowMs: NOW,
      });
      expect(await returnSealingToScanning(tx, { ...run, nowMs: NOW + 1 })).toBeNull();
      expect(
        await completeSealing(tx, {
          ...run,
          mediaAssetId: '22222222-2222-4222-8222-222222222222',
          nowMs: NOW + 1,
        }),
      ).toBeNull();
      await endIntake(tx, {
        intakeId: row.id,
        runId: 'r',
        from: ['sealing'],
        ending: { state: 'failed', failureCode: 'scan_unavailable' },
        nowMs: NOW + 2,
        userId: OWNER,
      });
      expect(await markIntakeObjectsPurged(tx, { ...other, nowMs: NOW + 3 })).toBe(false);
      expect(await refundIntakeDailyBytes(tx, { ...other, bytes: 40 * MIB, nowMs: NOW + 3 })).toBe(
        0,
      );
      expect(await kv.get(DAY_KEY)).toBe(40 * MIB);
      expect(await readIntakeStatus(tx, { userId: OWNER, intakeId: row.id })).toMatchObject({
        state: 'failed',
        attempts: 0,
        etag: null,
        scanBudgetWaitMs: 0,
        objectsPurgedAt: null,
        bytesRefundedAt: null,
        mediaAssetId: null,
      });
    });
  });

  it('ends a row once from the states named, answering its prior state, and refunds once', async () => {
    await kv.increment(DAY_KEY, 40 * MIB);
    await inRolledBackMigration(async (tx) => {
      const row = await uploadedIntake(tx, 'e');
      expect(
        await endIntake(tx, {
          intakeId: row.id,
          runId: null,
          from: ['scanning'],
          ending: { state: 'rejected', refusalCode: 'malware' },
          nowMs: NOW,
        }),
      ).toBeNull();
      const ended = await endIntake(tx, {
        intakeId: row.id,
        runId: null,
        from: ['uploaded'],
        ending: { state: 'failed', failureCode: 'scan_unavailable' },
        nowMs: NOW + 1,
        userId: OWNER,
      });
      expect(ended?.priorState).toBe('uploaded');
      expect(ended?.row).toMatchObject({
        state: 'failed',
        failureCode: 'scan_unavailable',
        leaseUntil: null,
      });

      expect(
        await refundIntakeDailyBytes(tx, {
          userId: OWNER,
          intakeId: row.id,
          bytes: 40 * MIB,
          nowMs: NOW,
        }),
      ).toBe(40 * MIB);
      expect(
        await refundIntakeDailyBytes(tx, {
          userId: OWNER,
          intakeId: row.id,
          bytes: 40 * MIB,
          nowMs: NOW,
        }),
      ).toBe(0);
      expect(await kv.get(DAY_KEY)).toBe(0);
      expect(
        await markIntakeObjectsPurged(tx, { userId: OWNER, intakeId: row.id, nowMs: NOW + 2 }),
      ).toBe(true);
      expect(
        await markIntakeObjectsPurged(tx, { userId: OWNER, intakeId: row.id, nowMs: NOW + 3 }),
      ).toBe(false);
    });
  });

  it('cancels an awaiting_parts upload by its key and gives back what the parts never stored', async () => {
    await kv.increment(DAY_KEY, 40 * MIB);
    await inRolledBackMigration(async (tx) => {
      const row = await insertIntake(tx, intakeInput('f'));
      const cancelled = await cancelIntakeByStagingKey(tx, {
        userId: OWNER,
        stagingKey: row.stagingKey,
        storedBytes: 16 * MIB,
        nowMs: NOW,
      });
      expect(cancelled).toMatchObject({ state: 'cancelled', cancelReason: 'client' });
      expect(await kv.get(DAY_KEY)).toBe(16 * MIB);
      expect(
        await cancelIntakeByStagingKey(tx, {
          userId: OWNER,
          stagingKey: row.stagingKey,
          storedBytes: 0,
          nowMs: NOW,
        }),
      ).toBeNull();
      expect(await kv.get(DAY_KEY)).toBe(16 * MIB);
    });
  });

  it('re-dispatches only leases that have passed, and never for an owner who may not run unattended', async () => {
    await inRolledBackMigration(async (tx) => {
      const due = await uploadedIntake(tx, 'g', NOW - 60 * 60_000);
      await uploadedIntake(tx, 'h', NOW);
      const suspended = await insertIntake(
        tx,
        intakeInput('i', {
          userId: SUSPENDED,
          stagingKey: `chat-attachments/${SUSPENDED}/1731000000000_i.pdf`,
          nowMs: NOW - 60 * 60_000,
        }),
      );
      const suspendedUploaded = await markUploaded(tx, {
        userId: SUSPENDED,
        stagingKey: suspended.stagingKey,
        nowMs: NOW - 60 * 60_000,
      });
      expect(suspendedUploaded).toMatchObject({ state: 'uploaded' });
      expect(
        (await listRedispatchableIntakes(tx, { nowMs: NOW, limit: 50 }))
          .map((row) => row.id)
          .sort(),
      ).toEqual([due.id, suspended.id].sort());
      await tx.execute(`update public.profiles set account_status = 'suspended' where id = $1`, [
        SUSPENDED,
      ]);

      const listed = await listRedispatchableIntakes(tx, { nowMs: NOW, limit: 50 });

      expect(listed).toEqual([
        { id: due.id, userId: OWNER, organizationId: null, state: 'uploaded' },
      ]);
    });
  });

  it('lists idle, stalled and unpurged rows, and prunes only rows whose objects are gone', async () => {
    await inRolledBackMigration(async (tx) => {
      const idle = await insertIntake(tx, intakeInput('j', { nowMs: NOW - 3 * 60 * 60_000 }));
      await insertIntake(tx, intakeInput('k', { nowMs: NOW }));
      expect(
        (
          await listIdleAwaitingPartsIntakes(tx, { idleBeforeMs: NOW - 2 * 60 * 60_000, limit: 10 })
        ).map((row) => row.id),
      ).toEqual([idle.id]);

      const stalled = await uploadedIntake(tx, 'l', NOW - 25 * 60 * 60_000);
      expect(
        (await listStalledIntakes(tx, { changedBeforeMs: NOW - 24 * 60 * 60_000, limit: 10 })).map(
          (row) => row.id,
        ),
      ).toContain(stalled.id);

      const purged = await uploadedIntake(tx, 'm', NOW - 9 * 24 * 60 * 60_000);
      const unpurged = await uploadedIntake(tx, 'n', NOW - 9 * 24 * 60 * 60_000);
      for (const row of [purged, unpurged]) {
        await endIntake(tx, {
          intakeId: row.id,
          runId: null,
          from: ['uploaded'],
          ending: { state: 'cancelled', cancelReason: 'client' },
          nowMs: NOW - 8 * 24 * 60 * 60_000,
        });
      }
      await markIntakeObjectsPurged(tx, { userId: OWNER, intakeId: purged.id, nowMs: NOW });
      expect(
        (await listUnpurgedTerminalIntakes(tx, { changedBeforeMs: NOW, limit: 10 })).map(
          (row) => row.id,
        ),
      ).toEqual([unpurged.id]);
      expect(
        await pruneTerminalIntakes(tx, { endedBeforeMs: NOW - 7 * 24 * 60 * 60_000, limit: 10 }),
      ).toBe(1);
      const [left] = await tx.query<{ ids: string[] }>(
        `select array_agg(id::text) as ids from public.chat_file_intakes where id = any($1::uuid[])`,
        [[purged.id, unpurged.id]],
      );
      expect(left?.ids).toEqual([unpurged.id]);
    });
  });

  it('creates the row on the instant its daily bytes were charged, so a refund finds that day', async () => {
    const lastMs = Date.parse('2026-11-14T23:59:59.900Z');
    const previousDay = `agi:chat-files:daily-bytes:${OWNER}:2026-11-14`;
    await kv.increment(previousDay, 40 * MIB);
    await inRolledBackMigration(async (tx) => {
      const row = await insertIntake(tx, intakeInput('midnight', { nowMs: lastMs }));
      expect(row.createdAt).toBe(lastMs);
      await refundIntakeDailyBytes(tx, {
        userId: OWNER,
        intakeId: row.id,
        bytes: 40 * MIB,
        nowMs: NOW,
      });
      expect(await kv.get(previousDay)).toBe(0);
      expect(await kv.get(DAY_KEY)).toBeNull();
    });
  });

  it('prunes a row that entered sealing and did not seal only once its sealed key was deleted again', async () => {
    await inRolledBackMigration(async (tx) => {
      const ended = NOW - 8 * 24 * 60 * 60_000;
      const sealing = await uploadedIntake(tx, 'o', NOW - 9 * 24 * 60 * 60_000);
      const plain = await uploadedIntake(tx, 'p', NOW - 9 * 24 * 60 * 60_000);
      await tx.execute(
        `update public.chat_file_intakes set sealing_entered_at = $2::timestamptz where id = $1::uuid`,
        [sealing.id, new Date(ended).toISOString()],
      );
      for (const row of [sealing, plain]) {
        await endIntake(tx, {
          intakeId: row.id,
          runId: null,
          from: ['uploaded'],
          ending: { state: 'failed', failureCode: 'stalled' },
          nowMs: ended,
        });
        await markIntakeObjectsPurged(tx, { userId: OWNER, intakeId: row.id, nowMs: ended });
      }
      const window = { endedBeforeMs: NOW - 7 * 24 * 60 * 60_000, limit: 10 };

      expect(await listPrunableUnsealedSealingIntakes(tx, window)).toEqual([
        { id: sealing.id, stagingKey: sealing.stagingKey },
      ]);
      expect(await pruneTerminalIntakes(tx, window)).toBe(1);
      expect(await pruneTerminalIntakes(tx, { ...window, sealedKeyClearedIds: [sealing.id] })).toBe(
        1,
      );
      const [left] = await tx.query<{ count: number }>(
        `select count(*)::int as count from public.chat_file_intakes where id = any($1::uuid[])`,
        [[sealing.id, plain.id]],
      );
      expect(left?.count).toBe(0);
    });
  });

  it('fails a preparation stalled for the sweeper’s window and leaves one that advanced an hour ago', async () => {
    await inRolledBackMigration(async (tx) => {
      const stalledForMs = CHAT_LARGE_FILE_POLICY.preparation.stallMs;
      const [stalled, recent] = await Promise.all(
        [stalledForMs + 60_000, 60 * 60_000].map(async (ageMs) => {
          const [row] = await tx.query<{ id: string }>(
            `insert into public.chat_file_preparations (user_id, kind, preparer_version, updated_at)
             values ($1, 'pdf', 1, now() - ($2::bigint * interval '1 millisecond'))
             returning id`,
            [OWNER, ageMs],
          );
          return row!.id;
        }),
      );

      const failed = await failStalledPreparations(tx, { stalledForMs, limit: 100 });

      expect(failed).toEqual([stalled]);
      const states = await tx.query<{ id: string; state: string; error: string | null }>(
        `select id, state, error from public.chat_file_preparations where id = any($1::uuid[])`,
        [[stalled, recent]],
      );
      expect(Object.fromEntries(states.map((row) => [row.id, [row.state, row.error]]))).toEqual({
        [stalled!]: ['prepare_failed', 'stalled'],
        [recent!]: ['preparing', null],
      });
    });
  });

  it('lists a sealed intake whose preparation went idle, and none that advanced, finished or stalled', async () => {
    await inRolledBackMigration(async (tx) => {
      const { redispatchAfterMs, stallMs } = CHAT_LARGE_FILE_POLICY.preparation;
      const [clock] = await tx.query<{ now_ms: string }>(
        `select (extract(epoch from now()) * 1000)::bigint::text as now_ms`,
      );
      const nowMs = Number(clock!.now_ms);
      const preparations = {
        idle: { ageMs: redispatchAfterMs + 60_000, state: 'preparing' },
        advanced: { ageMs: 60_000, state: 'preparing' },
        stalled: { ageMs: stallMs + 60_000, state: 'preparing' },
        finished: { ageMs: redispatchAfterMs + 60_000, state: 'ready' },
      } as const;
      const sealed: Record<string, { id: string; assetId: string }> = {};
      for (const [name, { ageMs, state }] of Object.entries(preparations)) {
        sealed[name] = await sealedIntake(tx, name);
        await tx.query(
          `insert into public.chat_file_preparations
             (media_asset_id, user_id, kind, state, preparer_version, updated_at)
           values ($1::uuid, $2, 'pdf', $3, 1, now() - ($4::bigint * interval '1 millisecond'))`,
          [sealed[name]!.assetId, OWNER, state, ageMs],
        );
      }

      const listed = await listSealedIntakesWithIdlePreparation(tx, {
        idleBeforeMs: nowMs - redispatchAfterMs,
        stalledBeforeMs: nowMs - stallMs,
        limit: 10,
      });

      expect(listed).toEqual([
        { id: sealed['idle']!.id, userId: OWNER, organizationId: null, state: 'sealed' },
      ]);
      expect(await preparationInProgress(tx, sealed['idle']!.assetId)).toBe(true);
      expect(await preparationInProgress(tx, sealed['finished']!.assetId)).toBe(false);
    });
  });
});
