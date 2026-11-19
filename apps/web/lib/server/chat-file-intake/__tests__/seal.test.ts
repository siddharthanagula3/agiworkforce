// @vitest-environment node
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import { MemoryObjectStore, ObjectStorageTimeoutError } from '@agiworkforce/object-storage';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');
type ModerationModule = typeof import('@/lib/moderation');
type HashDenylistModule = typeof import('@/lib/moderation/hash-denylist');

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
  recordGeneratedArtifactBytes: vi.fn(),
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<ModerationModule>()),
  recordModerationEvent: vi.fn(),
}));
vi.mock('@/lib/moderation/hash-denylist', async (importOriginal) => {
  const actual = await importOriginal<HashDenylistModule>();
  return { ...actual, matchDenylistedSha256: vi.fn(actual.matchDenylistedSha256) };
});

import { recordModerationEvent } from '@/lib/moderation';
import { recordGeneratedArtifactBytes } from '@/lib/services/infrastructure-cost';
import { matchDenylistedSha256 } from '@/lib/moderation/hash-denylist';
import { getKeyValueStore } from '@/lib/server/key-value';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { getObjectStore } from '@/lib/server/object-storage-runtime';
import { defaultSealDeps, sealChatFile } from '../seal';
import type { ChatFileIntakeRow } from '../store';
import { createFakeScanner, type ScannerScriptReply } from './fake-scanner';
import {
  createIntakeHarness,
  memoryObjectStore,
  objectExists,
  PRIVATE_BUCKET,
  putStagedFile,
  runInline,
  START_MS,
  stubMemoryObjectStorage,
} from './inline-executor';
import { intakeRow } from './memory-intake-store';

const LIVE_LEASE = START_MS + 60_000;
const RUN = 'run-a';

beforeEach(() => {
  stubMemoryObjectStorage();
  vi.mocked(getKeyValueStore).mockReturnValue(createMemoryKeyValueStore());
  vi.mocked(recordGeneratedArtifactBytes).mockClear();
});

async function sealingRow(overrides: Partial<ChatFileIntakeRow> = {}) {
  const base = intakeRow({
    state: 'scanning',
    workflowRunId: RUN,
    leaseUntil: LIVE_LEASE,
    attempts: 1,
    firstSubmittedAt: START_MS - 120_000,
    createdAt: START_MS,
    ...overrides,
  });
  const staged = await putStagedFile(base);
  const row: ChatFileIntakeRow = {
    ...base,
    declaredSha256: staged.sha256,
    etag: staged.etag,
    scanJobId: `${base.id}:${base.attempts}`,
    ...overrides,
  };
  return { row, staged };
}

function verdictFor(row: ChatFileIntakeRow, staged: { etag: string; sha256: string }) {
  return { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag };
}

function scannerAnswering(reply: ScannerScriptReply) {
  return createFakeScanner({ poll: () => reply });
}

function cleanReply(row: ChatFileIntakeRow, staged: { etag: string; sha256: string }) {
  return { answer: 'pollDoneClean', verdict: verdictFor(row, staged) };
}

async function putSealedKey(row: ChatFileIntakeRow, bytes = new Uint8Array(row.byteCount)) {
  await memoryObjectStore().put({
    bucket: PRIVATE_BUCKET,
    key: sealedChatAttachmentPathname(row.stagingKey),
    body: bytes,
    contentType: row.mimeType,
  });
}

function seal(harness: ReturnType<typeof createIntakeHarness>, row: ChatFileIntakeRow) {
  return sealChatFile(harness.deps, { intakeId: row.id, runId: RUN });
}

describe('sealChatFile', () => {
  it('seals onto the deterministic sealed key from the scanner’s own clean answer', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });

    const next = await seal(harness, row);

    const sealedRow = harness.store.row(row.id);
    expect(next).toEqual({ next: 'prepare', assetId: sealedRow.mediaAssetId });
    expect(sealedRow.state).toBe('sealed');
    expect(sealedRow.sealingEnteredAt).toBe(START_MS);
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(true);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('refuses when the stored object is no longer the bytes the scanner judged', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    await putStagedFile(row, new Uint8Array(row.byteCount).fill(0x62));

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id)).toMatchObject({
      state: 'rejected',
      refusalCode: 'changed_during_check',
    });
    expect(harness.seal.media).toEqual([]);
  });

  it('refuses a verdict whose ETag is not the inspected one', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering({
        answer: 'pollDoneClean',
        verdict: { ...verdictFor(row, staged), etag: '"another"' },
      }),
      rows: [row],
    });

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('changed_during_check');
  });

  it('refuses bytes whose hash is not the declared one', async () => {
    const { row, staged } = await sealingRow();
    const declared = { ...row, declaredSha256: 'c'.repeat(64) };
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [declared],
    });

    await expect(seal(harness, declared)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('checksum_mismatch');
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
  });

  it('refuses an infected verdict read at the seal', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering({ answer: 'pollDoneInfected', verdict: verdictFor(row, staged) }),
      rows: [row],
    });

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('malware');
    expect(harness.seal.media).toEqual([]);
  });

  it('refuses known illegal media and records the moderation event', async () => {
    const { row, staged } = await sealingRow();
    vi.mocked(matchDenylistedSha256).mockReturnValueOnce({ sha256: staged.sha256, matched: true });
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('denylist');
    expect(recordModerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'block', contentSha256: staged.sha256 }),
    );
  });

  it('goes back to polling while the scanner still has the job', async () => {
    const { row } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering({ answer: 'pollScanning' }),
      rows: [row],
    });

    await expect(seal(harness, row)).resolves.toMatchObject({ next: 'poll', pollIndex: 0 });
    expect(harness.store.row(row.id).state).toBe('scanning');
  });

  it('two deliveries of a clean seal make one media row', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });

    const results = await Promise.all([seal(harness, row), seal(harness, row)]);

    expect(harness.seal.media).toHaveLength(1);
    expect(results.filter((result) => result.next === 'prepare')).not.toHaveLength(0);
    expect(harness.store.row(row.id).mediaAssetId).toBe(harness.seal.media[0]!.id);
  });

  it('attaches to the media row the person already holds for the same bytes', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    harness.seal.media.push({
      id: '11111111-1111-4111-8111-111111111111',
      userId: row.userId,
      contentSha256: staged.sha256,
      scannedSha256: staged.sha256,
      storagePathname: 'chat-attachments/user-owner/earlier.pdf.scanned',
      byteSize: row.byteCount,
      metadata: {},
    });
    await putSealedKey(row);

    await expect(seal(harness, row)).resolves.toEqual({
      next: 'prepare',
      assetId: '11111111-1111-4111-8111-111111111111',
    });
    expect(harness.seal.media).toHaveLength(1);
    expect(harness.store.row(row.id).state).toBe('sealed');
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('refuses storage_full when the person’s storage cannot take the file, in a temporary chat too', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    harness.seal.storageFull = true;

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('storage_full');

    stubMemoryObjectStorage();
    const temporary = await sealingRow({ temporaryChat: true });
    const second = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(temporary.row, temporary.staged)),
      rows: [temporary.row],
    });
    second.seal.storageFull = true;
    await expect(seal(second, temporary.row)).resolves.toEqual({ next: 'end', reason: 'rejected' });
    expect(second.store.row(temporary.row.id).refusalCode).toBe('storage_full');
  });

  it('deletes its sealed copy when the intake row is gone by the time it commits', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const commit = harness.seal.commit.bind(harness.seal);
    harness.seal.commit = async (input) => {
      harness.store.remove(row.id);
      return commit(input);
    };

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'row_gone' });
    expect(harness.seal.media).toEqual([]);
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
  });

  it('a seal delivered again after its commit carries on to preparation with one media row', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const markPurged = harness.store.markPurged.bind(harness.store);
    let failures = 0;
    harness.store.markPurged = async (input) => {
      if (failures === 0) {
        failures += 1;
        throw new Error('connection reset');
      }
      return markPurged(input);
    };

    await expect(seal(harness, row)).rejects.toThrow('connection reset');
    expect(harness.store.row(row.id).state).toBe('sealed');

    const again = await seal(harness, row);

    expect(harness.seal.media).toHaveLength(1);
    expect(again).toEqual({ next: 'prepare', assetId: harness.seal.media[0]!.id });
    expect(harness.store.row(row.id).objectsPurgedAt).not.toBeNull();
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(true);
  });

  it('a seal from another run on a sealed row ends superseded', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    await expect(seal(harness, row)).resolves.toMatchObject({ next: 'prepare' });

    await expect(sealChatFile(harness.deps, { intakeId: row.id, runId: 'run-b' })).resolves.toEqual(
      { next: 'end', reason: 'superseded' },
    );
    expect(harness.seal.media).toHaveLength(1);
  });

  it('deletes its sealed copy when the commit fails because the intake row was erased', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    harness.seal.commit = async () => {
      harness.store.remove(row.id);
      throw new Error(
        'insert or update on table "media_assets" violates foreign key constraint "media_assets_conversation_id_fkey"',
      );
    };

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'row_gone' });
    expect(harness.seal.media).toEqual([]);
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
  });

  it('lets a failed commit be retried while the intake row is still there', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    harness.seal.commit = async () => {
      throw new Error('connection reset');
    };

    await expect(seal(harness, row)).rejects.toThrow('connection reset');
    expect(harness.store.row(row.id).state).toBe('sealing');
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(true);
  });

  it.each(['rejected', 'failed', 'cancelled'] as const)(
    'deletes its sealed copy when the row ended %s while the copy ran',
    async (state) => {
      const { row, staged } = await sealingRow();
      const harness = createIntakeHarness({
        scanner: scannerAnswering(cleanReply(row, staged)),
        rows: [row],
      });
      const commit = harness.seal.commit.bind(harness.seal);
      harness.seal.commit = async (input) => {
        harness.store.put({ ...harness.store.row(row.id), state, leaseUntil: null });
        return commit(input);
      };

      await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'superseded' });
      expect(harness.seal.media).toEqual([]);
      expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
    },
  );

  it('keeps the sealed copy when another run now holds the row in sealing', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const commit = harness.seal.commit.bind(harness.seal);
    harness.seal.commit = async (input) => {
      harness.store.put({ ...harness.store.row(row.id), workflowRunId: 'run-b' });
      return commit(input);
    };

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'superseded' });
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(true);
  });

  it('a re-entered seal that ends scan_unavailable deletes the sealed key', async () => {
    const { row } = await sealingRow({
      state: 'sealing',
      attempts: 4,
      sealingEnteredAt: START_MS - 60_000,
    });
    await putSealedKey(row);
    const harness = createIntakeHarness({
      scanner: scannerAnswering({ answer: 'pollDoneScanFailed' }),
      rows: [row],
    });

    const run = await runInline(harness, { intakeId: row.id, runId: RUN });

    expect(run.last).toEqual({ next: 'end', reason: 'failed' });
    expect(harness.store.row(row.id)).toMatchObject({
      state: 'failed',
      failureCode: 'scan_unavailable',
    });
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });
});

describe('the sealing copy', () => {
  it('makes one store call per copy, each with its own deadline', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const copy = vi.spyOn(getObjectStore(), 'copyIfMatch');

    await expect(seal(harness, row)).resolves.toMatchObject({ next: 'prepare' });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0]![0]).toMatchObject({
      sourceKey: row.stagingKey,
      destinationKey: sealedChatAttachmentPathname(row.stagingKey),
      etag: staged.etag,
    });
  });

  it.each([
    ['ObjectStorageTimeoutError', () => new ObjectStorageTimeoutError(1_000)],
    [
      'an error named TimeoutError',
      () => Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }),
    ],
  ])('reads the sealed key after %s and seals when the copy finished', async (_name, timeout) => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const store = memoryObjectStore();
    const copy = vi.spyOn(store, 'copyIfMatch').mockImplementation(async (input) => {
      await MemoryObjectStore.prototype.copyIfMatch.call(store, input);
      throw timeout();
    });

    await expect(seal(harness, row)).resolves.toMatchObject({ next: 'prepare' });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(harness.seal.media).toHaveLength(1);
  });

  it('copies again after a timeout that left no sealed copy', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const copy = vi
      .spyOn(getObjectStore(), 'copyIfMatch')
      .mockRejectedValueOnce(new ObjectStorageTimeoutError(1_000));

    await expect(seal(harness, row)).resolves.toMatchObject({ next: 'prepare' });
    expect(copy).toHaveBeenCalledTimes(2);
  });

  it('stops after three copies that never answer and leaves the row for the sweeper', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const copy = vi
      .spyOn(getObjectStore(), 'copyIfMatch')
      .mockRejectedValue(new ObjectStorageTimeoutError(1_000));

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'copy_unfinished' });
    expect(copy).toHaveBeenCalledTimes(3);
    expect(harness.store.row(row.id).state).toBe('sealing');
    expect(harness.seal.media).toEqual([]);
  });

  it('deletes a sealed copy that landed while the intake row was erased, when no copy answers', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const store = memoryObjectStore();
    const copy = vi.spyOn(store, 'copyIfMatch').mockImplementation(async (input) => {
      await MemoryObjectStore.prototype.copyIfMatch.call(store, input);
      harness.store.remove(row.id);
      throw new Error('connection reset');
    });

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'row_gone' });
    expect(copy).toHaveBeenCalledTimes(3);
    expect(harness.seal.media).toEqual([]);
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
  });

  it('deletes a sealed copy that landed after the intake was cancelled, when no copy answers', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    const store = memoryObjectStore();
    vi.spyOn(store, 'copyIfMatch').mockImplementation(async (input) => {
      await MemoryObjectStore.prototype.copyIfMatch.call(store, input);
      harness.store.put({
        ...harness.store.row(row.id),
        state: 'cancelled',
        cancelReason: 'client',
      });
      throw new Error('connection reset');
    });

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'superseded' });
    expect(await objectExists(sealedChatAttachmentPathname(row.stagingKey))).toBe(false);
  });

  it('never takes a sealed key of the wrong length as a finished copy', async () => {
    const { row, staged } = await sealingRow();
    const harness = createIntakeHarness({
      scanner: scannerAnswering(cleanReply(row, staged)),
      rows: [row],
    });
    await putSealedKey(row, new Uint8Array(3));
    const copy = vi
      .spyOn(getObjectStore(), 'copyIfMatch')
      .mockRejectedValue(new ObjectStorageTimeoutError(1_000));

    await expect(seal(harness, row)).resolves.toEqual({ next: 'end', reason: 'copy_unfinished' });
    expect(copy).toHaveBeenCalledTimes(3);
  });
});

describe('defaultSealDeps', () => {
  function fakeTransactionDb(completeRows: Record<string, unknown>[]) {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    let rolledBack = false;
    let committed = false;
    const tx = {
      async query(sql: string, params: unknown[] = []) {
        statements.push({ sql, params });
        if (sql.includes('insert into public.media_assets')) {
          return [{ id: '22222222-2222-4222-8222-222222222222' }];
        }
        if (sql.includes("set state = 'sealed'")) return completeRows;
        throw new Error(`Unexpected statement: ${sql}`);
      },
    };
    const db = {
      ...tx,
      async transaction<T>(fn: (inner: typeof tx) => Promise<T>): Promise<T> {
        try {
          const result = await fn(tx);
          committed = true;
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    };
    return {
      db: db as unknown as DatabaseAdapter,
      statements,
      outcome: () => ({ rolledBack, committed }),
    };
  }

  const verdict = {
    jobId: 'job:1',
    outcome: 'clean' as const,
    reason: null,
    sha256: 'd'.repeat(64),
    bytes: 40 * 1024 * 1024,
    etag: '"etag"',
    ms: 10,
  };

  it('inserts the scanned media row and seals the intake in one transaction', async () => {
    const row = intakeRow({ state: 'sealing', workflowRunId: RUN });
    const fake = fakeTransactionDb([{ ...snake(row), state: 'sealed' }]);

    await expect(
      defaultSealDeps(fake.db).commit({
        row,
        runId: RUN,
        verdict,
        sealedKey: `${row.stagingKey}.scanned`,
        nowMs: START_MS,
      }),
    ).resolves.toBe('sealed');

    expect(fake.outcome()).toEqual({ rolledBack: false, committed: true });
    expect(recordGeneratedArtifactBytes).toHaveBeenCalledTimes(1);
    expect(recordGeneratedArtifactBytes).toHaveBeenCalledWith(
      expect.objectContaining({ userId: row.userId, bytes: row.byteCount, kind: 'file' }),
    );
    const insert = fake.statements[0]!;
    expect(insert.sql).toMatch(/scanned_sha256/);
    expect(insert.params[8]).toBe(verdict.sha256);
    expect(insert.params[5]).toBe(`${row.stagingKey}.scanned`);
    expect(JSON.parse(String(insert.params[6]))).toMatchObject({ source: 'chat-attachment' });
    expect(fake.statements[1]!.params.slice(0, 3)).toEqual([
      row.id,
      RUN,
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(fake.statements[1]!.sql).toMatch(/\bi\.user_id = \$\d+/);
    expect(fake.statements[1]!.params).toContain(row.userId);
  });

  it('attaches only an intake of the person who holds the media row', async () => {
    const row = intakeRow({ state: 'sealing', workflowRunId: RUN });
    const fake = fakeTransactionDb([{ ...snake(row), state: 'sealed' }]);

    await expect(
      defaultSealDeps(fake.db).attach({
        row,
        runId: RUN,
        assetId: '22222222-2222-4222-8222-222222222222',
        nowMs: START_MS,
      }),
    ).resolves.toBe('sealed');
    expect(fake.statements[0]!.sql).toMatch(/\bi\.user_id = \$\d+/);
    expect(fake.statements[0]!.params).toContain(row.userId);
  });

  it('rolls the media insert back when the intake is no longer held', async () => {
    const row = intakeRow({ state: 'sealing', workflowRunId: RUN });
    const fake = fakeTransactionDb([]);

    await expect(
      defaultSealDeps(fake.db).commit({
        row,
        runId: RUN,
        verdict,
        sealedKey: `${row.stagingKey}.scanned`,
        nowMs: START_MS,
      }),
    ).resolves.toBe('not_held');
    expect(fake.outcome()).toEqual({ rolledBack: true, committed: false });
    expect(recordGeneratedArtifactBytes).not.toHaveBeenCalled();
  });
});

function snake(row: ChatFileIntakeRow): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      typeof value === 'number' && key.endsWith('At') ? new Date(value).toISOString() : value,
    ]),
  );
}
