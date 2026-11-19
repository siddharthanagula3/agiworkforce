// @vitest-environment node
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type UploadScanModule = typeof import('@/lib/security/upload-scan');

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/security/upload-scan', async (importOriginal) => {
  const actual = await importOriginal<UploadScanModule>();
  return { ...actual, inspectUploadHead: vi.fn(actual.inspectUploadHead) };
});

import { inspectUploadHead, UPLOAD_INSPECTION_BYTES } from '@/lib/security/upload-scan';
import { getKeyValueStore } from '@/lib/server/key-value';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { runChatFileIntakeStep } from '../steps';
import {
  cancelIntakeByStagingKey,
  insertIntake,
  intakeLeaseUntil,
  listRedispatchableIntakes,
  type ChatFileIntakeRow,
} from '../store';
import { cancelChatFileIntake, endChatFileIntake, purgeIntakeObjects } from '../transitions';
import { createFakeScanner, type ScannerScriptReply } from './fake-scanner';
import { createQueryDb } from './fake-query-db';
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

const actualUploadScan = await vi.importActual<UploadScanModule>('@/lib/security/upload-scan');
const MIB = 1024 * 1024;
const LIVE_LEASE = START_MS + 60_000;
const EXPIRED_LEASE = START_MS - 1;

let kv: KeyValueStore;

beforeEach(() => {
  stubMemoryObjectStorage();
  kv = createMemoryKeyValueStore();
  vi.mocked(getKeyValueStore).mockReturnValue(kv);
});

async function stagedRow(overrides: Partial<ChatFileIntakeRow> = {}) {
  const base = intakeRow({ createdAt: START_MS, stateChangedAt: START_MS, ...overrides });
  const staged = await putStagedFile(base);
  return { row: { ...base, declaredSha256: staged.sha256 }, staged };
}

function cleanVerdict(row: ChatFileIntakeRow, staged: { etag: string; sha256: string }) {
  return { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag };
}

function cleanScanner(
  row: ChatFileIntakeRow,
  staged: { etag: string; sha256: string },
  firstPolls: ScannerScriptReply[] = [{ answer: 'pollScanning' }],
) {
  return createFakeScanner({
    submit: () => ({ answer: 'submitAccepted' }),
    poll: (_call, index) =>
      firstPolls[index] ?? { answer: 'pollDoneClean', verdict: cleanVerdict(row, staged) },
  });
}

function dailyBytesKey(userId: string, atMs: number) {
  return `agi:chat-files:daily-bytes:${userId}:${new Date(atMs).toISOString().slice(0, 10)}`;
}

describe('an intake run', () => {
  it('inspects, scans and seals one media row, signing the scanner source for 30 minutes', async () => {
    const { row, staged } = await stagedRow();
    const scanner = cleanScanner(row, staged);
    const harness = createIntakeHarness({ scanner, rows: [row] });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(run.last).toEqual({ next: 'end', reason: 'finished' });
    const sealed = harness.store.row(row.id);
    expect(sealed.state).toBe('sealed');
    expect(sealed.attempts).toBe(1);
    expect(sealed.etag).toBe(staged.etag);
    expect(sealed.objectsPurgedAt).not.toBeNull();
    expect(harness.seal.media).toHaveLength(1);
    const sealedKey = sealedChatAttachmentPathname(row.stagingKey);
    expect(harness.seal.media[0]).toMatchObject({
      storagePathname: sealedKey,
      scannedSha256: staged.sha256,
      byteSize: row.byteCount,
    });
    expect(sealed.mediaAssetId).toBe(harness.seal.media[0]!.id);
    expect(await objectExists(sealedKey)).toBe(true);
    expect(await objectExists(row.stagingKey)).toBe(false);
    expect(harness.presignGet).toHaveBeenCalledTimes(1);
    expect(harness.presignGet.mock.calls[0]![0]).toMatchObject({
      key: row.stagingKey,
      expiresInSeconds: 1800,
    });
    expect(scanner.submits()[0]?.body).toMatchObject({
      jobId: `${row.id}:1`,
      byteCount: row.byteCount,
      etag: staged.etag,
      mimeType: row.mimeType,
    });
    expect(harness.reindexed).toEqual([sealed.mediaAssetId]);
  });

  it('does nothing more when a step is delivered twice', async () => {
    const { row, staged } = await stagedRow();
    const harness = createIntakeHarness({ scanner: cleanScanner(row, staged, []), rows: [row] });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });
    expect(run.last).toEqual({ next: 'end', reason: 'finished' });

    const assetId = harness.store.row(row.id).mediaAssetId;
    await expect(
      runChatFileIntakeStep(harness.deps, { intakeId: row.id, runId: 'run-1' }, { next: 'seal' }),
    ).resolves.toEqual({ next: 'prepare', assetId });
    await expect(
      runChatFileIntakeStep(harness.deps, { intakeId: row.id, runId: 'run-2' }, { next: 'seal' }),
    ).resolves.toEqual({ next: 'end', reason: 'superseded' });
    await expect(
      runChatFileIntakeStep(
        harness.deps,
        { intakeId: row.id, runId: 'run-1' },
        { next: 'inspect' },
      ),
    ).resolves.toEqual({ next: 'end', reason: 'superseded' });
    const again = await runInline(harness, { intakeId: row.id, runId: 'run-1' });
    expect(again.last).toEqual({ next: 'end', reason: 'already_sealed' });
    expect(harness.seal.media).toHaveLength(1);
    expect(harness.store.row(row.id).attempts).toBe(1);
  });

  it('a run started again for a sealed row whose preparation went idle prepares and indexes it', async () => {
    const { row, staged } = await stagedRow();
    const preparing = new Set<string>();
    const prepared: string[] = [];
    const harness = createIntakeHarness({
      scanner: cleanScanner(row, staged, []),
      rows: [row],
      overrides: {
        async prepare(assetId) {
          prepared.push(assetId);
          return { done: true };
        },
        preparing: async (assetId) => preparing.has(assetId),
      },
    });
    await runInline(harness, { intakeId: row.id, runId: 'run-1' });
    const assetId = harness.store.row(row.id).mediaAssetId;
    if (!assetId) throw new Error('the first run did not seal the row');
    preparing.add(assetId);

    const again = await runInline(harness, { intakeId: row.id, runId: 'run-2' });

    expect(again.last).toEqual({ next: 'end', reason: 'finished' });
    expect(prepared).toEqual([assetId, assetId]);
    expect(harness.reindexed).toEqual([assetId, assetId]);
    expect(harness.seal.media).toHaveLength(1);
    expect(harness.store.row(row.id)).toMatchObject({ state: 'sealed', attempts: 1 });
  });

  it('a re-dispatched run for an inspecting row inspects again before it submits', async () => {
    const { row, staged } = await stagedRow({
      state: 'inspecting',
      workflowRunId: 'run-old',
      leaseUntil: EXPIRED_LEASE,
    });
    const order: string[] = [];
    const scanner = createFakeScanner({
      submit: () => {
        order.push('submit');
        return { answer: 'submitAccepted' };
      },
      poll: () => ({ answer: 'pollDoneClean', verdict: cleanVerdict(row, staged) }),
    });
    const harness = createIntakeHarness({ scanner, rows: [row] });
    const objects = harness.deps.objects;
    harness.deps.objects = {
      ...objects,
      head: async (key) => {
        order.push(`head:${key === row.stagingKey ? 'staging' : 'other'}`);
        return objects.head(key);
      },
      readHead: async (key, maxBytes) => {
        order.push('readHead');
        return objects.readHead(key, maxBytes);
      },
    };
    vi.mocked(inspectUploadHead).mockImplementationOnce((...args) => {
      order.push('inspectUploadHead');
      return actualUploadScan.inspectUploadHead(...args);
    });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-new' });

    expect(run.directives[0]).toEqual({ next: 'inspect' });
    expect(order.slice(0, 5)).toEqual([
      'head:staging',
      'readHead',
      'head:staging',
      'inspectUploadHead',
      'submit',
    ]);
    expect(harness.store.row(row.id)).toMatchObject({ state: 'sealed', workflowRunId: 'run-new' });
  });

  it('a re-dispatched run for a scanning row polls the recorded job, then starts a new attempt', async () => {
    const { row, staged } = await stagedRow({
      state: 'scanning',
      workflowRunId: 'run-old',
      leaseUntil: EXPIRED_LEASE,
      attempts: 1,
      scanJobId: `${intakeRow().id}:1`,
      firstSubmittedAt: START_MS - 60_000,
    });
    setRowEtag(row, staged.etag);
    const scanner = cleanScanner(row, staged, [{ answer: 'pollUnknown' }]);
    const harness = createIntakeHarness({ scanner, rows: [row] });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-new' });

    expect(scanner.polls()[0]?.jobId).toBe(`${row.id}:1`);
    expect(scanner.submits().map((call) => call.jobId)).toEqual([`${row.id}:2`]);
    expect(run.last).toEqual({ next: 'end', reason: 'finished' });
    expect(harness.store.row(row.id)).toMatchObject({ state: 'sealed', attempts: 2 });
  });

  it.each(['inspecting', 'scanning', 'sealing'] as const)(
    'a second live run ends without doing the next step when the row is %s',
    async (state) => {
      const { row, staged } = await stagedRow({
        state,
        workflowRunId: 'run-a',
        leaseUntil: LIVE_LEASE,
        attempts: state === 'inspecting' ? 0 : 1,
        scanJobId: state === 'inspecting' ? null : `${intakeRow().id}:1`,
        firstSubmittedAt: state === 'inspecting' ? null : START_MS - 1_000,
        sealingEnteredAt: state === 'sealing' ? START_MS - 1_000 : null,
      });
      setRowEtag(row, staged.etag);
      const scanner = cleanScanner(row, staged, []);
      const harness = createIntakeHarness({ scanner, rows: [row] });
      const readHead = vi.spyOn(harness.deps.objects, 'readHead');

      const run = await runInline(harness, { intakeId: row.id, runId: 'run-b' });

      expect(run.last).toEqual({ next: 'end', reason: 'superseded' });
      expect(harness.store.row(row.id)).toEqual(row);
      expect(scanner.calls).toEqual([]);
      expect(readHead).not.toHaveBeenCalled();
      expect(harness.seal.media).toEqual([]);
      expect(await objectExists(row.stagingKey)).toBe(true);
    },
  );

  it('re-enters a seal from the same run, or from another once the lease has passed', async () => {
    for (const [runId, leaseUntil] of [
      ['run-a', LIVE_LEASE],
      ['run-b', EXPIRED_LEASE],
    ] as const) {
      stubMemoryObjectStorage();
      const { row, staged } = await stagedRow({
        state: 'sealing',
        workflowRunId: 'run-a',
        leaseUntil,
        attempts: 1,
        scanJobId: `${intakeRow().id}:1`,
        firstSubmittedAt: START_MS - 1_000,
        sealingEnteredAt: START_MS - 1_000,
      });
      setRowEtag(row, staged.etag);
      const harness = createIntakeHarness({ scanner: cleanScanner(row, staged, []), rows: [row] });

      const run = await runInline(harness, { intakeId: row.id, runId });

      expect(run.last).toEqual({ next: 'end', reason: 'finished' });
      expect(harness.store.row(row.id)).toMatchObject({ state: 'sealed', workflowRunId: runId });
      expect(harness.seal.media).toHaveLength(1);
    }
  });

  it('a sealing row is not re-dispatched before lease_until and is after it', async () => {
    const { row, staged } = await stagedRow({
      state: 'sealing',
      workflowRunId: 'run-a',
      leaseUntil: intakeLeaseUntil('sealing', START_MS),
      attempts: 1,
      scanJobId: `${intakeRow().id}:1`,
      firstSubmittedAt: START_MS - 1_000,
      sealingEnteredAt: START_MS,
    });
    setRowEtag(row, staged.etag);
    const harness = createIntakeHarness({ scanner: cleanScanner(row, staged, []), rows: [row] });

    const leaseMs = intakeLeaseUntil('sealing', START_MS) - START_MS;
    harness.clock.advance(leaseMs - 1);
    const early = await runInline(harness, { intakeId: row.id, runId: 'run-b' });
    expect(early.last).toEqual({ next: 'end', reason: 'superseded' });
    expect(harness.store.row(row.id).state).toBe('sealing');

    harness.clock.advance(2);
    const late = await runInline(harness, { intakeId: row.id, runId: 'run-b' });
    expect(late.last).toEqual({ next: 'end', reason: 'finished' });

    const { db, query } = createQueryDb(async () => []);
    await listRedispatchableIntakes(db, { nowMs: START_MS, limit: 50 });
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/i\.lease_until < \$1::timestamptz/);
    expect(sql).toMatch(/for update of i skip locked/);
    expect((params as unknown[])[0]).toBe(new Date(START_MS).toISOString());
    expect((params as unknown[])[2]).toContain('sealing');
  });

  it('each scan poll renews the lease from the time of the poll', async () => {
    const { row } = await stagedRow();
    const leases: Array<[number, number | null]> = [];
    const harness = createIntakeHarness({
      scanner: createFakeScanner({
        submit: () => ({ answer: 'submitAccepted' }),
        poll: (_call, index) => {
          leases.push([harness.clock.now(), harness.store.row(row.id).leaseUntil]);
          return index < 3 ? { answer: 'pollScanning' } : { answer: 'pollQueued' };
        },
      }),
      rows: [row],
    });

    await runInline(harness, { intakeId: row.id, runId: 'run-1', maxSteps: 7 });

    expect(leases.length).toBeGreaterThanOrEqual(4);
    for (const [nowMs, leaseUntil] of leases) {
      expect(leaseUntil).toBe(intakeLeaseUntil('scanning', nowMs));
    }
    expect(new Set(leases.map(([nowMs]) => nowMs)).size).toBe(leases.length);
  });

  it('waits its turn while another intake of the person is scanning, renewing its lease at each wake', async () => {
    const { row, staged } = await stagedRow();
    const other = intakeRow({
      id: '9e8d7c6b-5a49-4382-b716-0a1b2c3d4e5f',
      state: 'scanning',
      workflowRunId: 'run-other',
      leaseUntil: LIVE_LEASE,
      stagingKey: 'chat-attachments/user-owner/1731000000001_zzz.pdf',
    });
    const harness = createIntakeHarness({
      scanner: cleanScanner(row, staged, []),
      rows: [row, other],
    });
    const renew = vi.spyOn(harness.store, 'renew');
    let wakes = 0;

    const run = await runInline(harness, {
      intakeId: row.id,
      runId: 'run-1',
      onSleep: (sleptMs) => {
        if (sleptMs === 30_000) wakes += 1;
        if (wakes === 3) harness.store.put({ ...harness.store.row(other.id), state: 'sealed' });
      },
    });

    expect(run.sleeps.slice(0, 3)).toEqual([30_000, 30_000, 30_000]);
    expect(run.last).toEqual({ next: 'end', reason: 'finished' });
    const inspectingRenewals = renew.mock.calls.filter(([input]) => input.state === 'inspecting');
    expect(inspectingRenewals).toHaveLength(4);
    for (const [index, [input]] of renew.mock.calls.entries()) {
      const renewed = await renew.mock.results[index]!.value;
      expect(renewed?.leaseUntil).toBe(intakeLeaseUntil(input.state, input.nowMs));
    }
  });

  it('never inspects a short ranged read as the file', async () => {
    const { row, staged } = await stagedRow();
    const scanner = cleanScanner(row, staged);
    const harness = createIntakeHarness({ scanner, rows: [row] });
    const readHead = vi.fn(async (key: string, maxBytes: number) => {
      const head = await harness.deps.objects.head(key);
      return head ? new Uint8Array(Math.max(0, maxBytes - 1)) : null;
    });
    harness.deps.objects = { ...harness.deps.objects, readHead };

    await expect(runInline(harness, { intakeId: row.id, runId: 'run-1' })).rejects.toThrow();

    expect(readHead).toHaveBeenCalledTimes(2);
    expect(inspectUploadHead).not.toHaveBeenCalled();
    expect(harness.store.row(row.id)).toMatchObject({
      state: 'inspecting',
      workflowRunId: 'run-1',
      refusalCode: null,
      bytesRefundedAt: null,
    });
    expect(harness.store.row(row.id).leaseUntil).toBe(intakeLeaseUntil('inspecting', START_MS));
    expect(await objectExists(row.stagingKey)).toBe(true);
    expect(scanner.calls).toEqual([]);
  });

  it('refuses changed_during_check when a short ranged read comes with an object that changed', async () => {
    const { row, staged } = await stagedRow();
    const scanner = cleanScanner(row, staged);
    const harness = createIntakeHarness({ scanner, rows: [row] });
    const readHead = vi.fn(async (key: string, maxBytes: number) => {
      const head = await harness.deps.objects.head(key);
      await memoryObjectStore().put({
        bucket: PRIVATE_BUCKET,
        key,
        body: new Uint8Array(row.byteCount).fill(0x62),
        contentType: row.mimeType,
      });
      return head ? new Uint8Array(Math.max(0, maxBytes - 1)) : null;
    });
    harness.deps.objects = { ...harness.deps.objects, readHead };

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(inspectUploadHead).not.toHaveBeenCalled();
    expect(run.last).toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id)).toMatchObject({
      state: 'rejected',
      refusalCode: 'changed_during_check',
    });
    expect(scanner.calls).toEqual([]);
  });

  it('reads again once when the first ranged read comes back short', async () => {
    const { row, staged } = await stagedRow();
    const harness = createIntakeHarness({ scanner: cleanScanner(row, staged), rows: [row] });
    const objects = harness.deps.objects;
    let reads = 0;
    harness.deps.objects = {
      ...objects,
      readHead: async (key, maxBytes) => {
        reads += 1;
        const head = await objects.readHead(key, maxBytes);
        return reads === 1 && head ? head.subarray(0, head.byteLength - 1) : head;
      },
    };

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(reads).toBe(2);
    expect(inspectUploadHead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(inspectUploadHead).mock.calls[0]![0].byteLength).toBe(
      Math.min(row.byteCount, UPLOAD_INSPECTION_BYTES),
    );
    expect(run.last).toEqual({ next: 'end', reason: 'finished' });
  });

  it('ends dlp_blocked when the workspace policy blocks the file, and never submits it', async () => {
    const { row, staged } = await stagedRow();
    const scanner = cleanScanner(row, staged);
    const inspectContent = vi.fn(async () => 'blocked' as const);
    const harness = createIntakeHarness({ scanner, rows: [row], overrides: { inspectContent } });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(inspectContent).toHaveBeenCalledTimes(1);
    expect(run.last).toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id)).toMatchObject({
      state: 'rejected',
      refusalCode: 'dlp_blocked',
    });
    expect(scanner.submits()).toEqual([]);
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('refuses a file whose stored size is not the declared one', async () => {
    const base = intakeRow({ createdAt: START_MS });
    await putStagedFile(base, new Uint8Array(base.byteCount - 1));
    const harness = createIntakeHarness({
      scanner: createFakeScanner({}),
      rows: [base],
    });

    const run = await runInline(harness, { intakeId: base.id, runId: 'run-1' });

    expect(run.last).toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(base.id).refusalCode).toBe('size_mismatch');
  });
});

describe('ending an intake', () => {
  it.each([
    ['rejected', { state: 'rejected', refusalCode: 'malware' }],
    ['failed', { state: 'failed', failureCode: 'scan_unavailable' }],
    ['cancelled', { state: 'cancelled', cancelReason: 'client' }],
  ] as const)(
    'deletes the sealed key when a row that entered sealing ends %s',
    async (_name, ending) => {
      const { row } = await stagedRow({
        state: 'sealing',
        workflowRunId: 'run-a',
        leaseUntil: LIVE_LEASE,
        sealingEnteredAt: START_MS - 1_000,
      });
      const sealedKey = sealedChatAttachmentPathname(row.stagingKey);
      await memoryObjectStore().put({
        bucket: PRIVATE_BUCKET,
        key: sealedKey,
        body: new Uint8Array(4),
        contentType: row.mimeType,
      });
      const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

      const ended = await endChatFileIntake(harness.deps, {
        intakeId: row.id,
        runId: 'run-a',
        from: ['sealing'],
        ending,
      });

      expect(ended?.row.state).toBe(ending.state);
      expect(await objectExists(sealedKey)).toBe(false);
      expect(await objectExists(row.stagingKey)).toBe(false);
      expect(harness.store.row(row.id).objectsPurgedAt).not.toBeNull();
    },
  );

  it('leaves no sealed key to delete for a row that never entered sealing', async () => {
    const { row } = await stagedRow({ state: 'scanning', workflowRunId: 'run-a' });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });
    const deleted = vi.spyOn(harness.deps.objects, 'delete');

    await endChatFileIntake(harness.deps, {
      intakeId: row.id,
      runId: 'run-a',
      from: ['scanning'],
      ending: { state: 'rejected', refusalCode: 'malware' },
    });

    expect(deleted.mock.calls.map(([key]) => key)).toEqual([row.stagingKey]);
  });

  it('keeps an ending whose purge fails for the sweeper to retry', async () => {
    const { row } = await stagedRow({ state: 'scanning', workflowRunId: 'run-a' });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });
    harness.deps.objects = {
      ...harness.deps.objects,
      delete: async () => {
        throw new Error('storage down');
      },
    };

    const ended = await endChatFileIntake(harness.deps, {
      intakeId: row.id,
      runId: 'run-a',
      from: ['scanning'],
      ending: { state: 'rejected', refusalCode: 'malware' },
    });

    expect(ended?.row.state).toBe('rejected');
    expect(harness.store.row(row.id).objectsPurgedAt).toBeNull();
  });

  it('keeps an ended upload unpurged while its abort fails, and purges it once the upload is gone', async () => {
    const store = memoryObjectStore();
    const base = intakeRow({ state: 'awaiting_parts', createdAt: START_MS });
    const upload = await store.createMultipartUpload({
      bucket: PRIVATE_BUCKET,
      key: base.stagingKey,
      contentType: base.mimeType,
    });
    await store.uploadPart({ ...upload, partNumber: 1, body: new Uint8Array(5 * MIB) });
    const row = { ...base, multipartUploadId: upload.uploadId };
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });
    const abort = vi
      .spyOn(store, 'abortMultipartUpload')
      .mockRejectedValueOnce(new Error('storage down'));

    const ended = await endChatFileIntake(harness.deps, {
      intakeId: row.id,
      runId: null,
      from: ['awaiting_parts'],
      ending: { state: 'cancelled', cancelReason: 'idle' },
      storedBytes: 5 * MIB,
    });

    expect(ended?.row.state).toBe('cancelled');
    expect(harness.store.row(row.id).objectsPurgedAt).toBeNull();
    expect(await store.listUploadedParts(upload)).toHaveLength(1);

    await expect(purgeIntakeObjects(harness.deps, harness.store.row(row.id))).resolves.toBe(true);
    expect(abort).toHaveBeenCalledTimes(2);
    expect(harness.store.row(row.id).objectsPurgedAt).not.toBeNull();
    await expect(store.listUploadedParts(upload)).rejects.toThrow();
  });

  it('purges an ended upload whose multipart upload is already gone', async () => {
    const row = intakeRow({ state: 'rejected', refusalCode: 'malware', multipartUploadId: 'gone' });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await expect(purgeIntakeObjects(harness.deps, row)).resolves.toBe(true);
    expect(harness.store.row(row.id).objectsPurgedAt).not.toBeNull();
  });

  it('gives back the declared bytes the parts never stored when an awaiting_parts row ends', async () => {
    const row = intakeRow({ state: 'awaiting_parts', createdAt: START_MS, byteCount: 40 * MIB });
    await kv.increment(dailyBytesKey(row.userId, START_MS), 40 * MIB);
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await endChatFileIntake(harness.deps, {
      intakeId: row.id,
      runId: null,
      from: ['awaiting_parts'],
      ending: { state: 'cancelled', cancelReason: 'idle' },
      storedBytes: 15 * MIB,
    });
    await endChatFileIntake(harness.deps, {
      intakeId: row.id,
      runId: null,
      from: ['awaiting_parts', 'cancelled'],
      ending: { state: 'cancelled', cancelReason: 'idle' },
      storedBytes: 0,
    });

    expect(await kv.get(dailyBytesKey(row.userId, START_MS))).toBe(15 * MIB);
  });
});

describe('cancelling an intake', () => {
  it('cancels during a scan, and the scanning run stops at its next step', async () => {
    const { row, staged } = await stagedRow({
      state: 'scanning',
      workflowRunId: 'run-a',
      leaseUntil: LIVE_LEASE,
      attempts: 1,
      scanJobId: `${intakeRow().id}:1`,
      firstSubmittedAt: START_MS,
    });
    setRowEtag(row, staged.etag);
    const scanner = cleanScanner(row, staged, []);
    const harness = createIntakeHarness({ scanner, rows: [row] });

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(await objectExists(row.stagingKey)).toBe(false);

    await expect(
      runChatFileIntakeStep(
        harness.deps,
        { intakeId: row.id, runId: 'run-a' },
        { next: 'poll', pollIndex: 1, scanningSinceMs: null, deadlineMs: null },
      ),
    ).resolves.toEqual({ next: 'end', reason: 'superseded' });
    expect(scanner.polls()).toEqual([]);
    expect(harness.seal.media).toEqual([]);
  });

  it('answers a sealing row as it stands and another person as missing', async () => {
    const { row } = await stagedRow({
      state: 'sealing',
      workflowRunId: 'run-a',
      leaseUntil: LIVE_LEASE,
      sealingEnteredAt: START_MS,
    });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'not_cancellable' });
    await expect(
      cancelChatFileIntake(harness.deps, { userId: 'someone-else', intakeId: row.id }),
    ).resolves.toEqual({ outcome: 'missing' });
    expect(harness.store.row(row.id).state).toBe('sealing');
    expect(await objectExists(row.stagingKey)).toBe(true);
  });

  it('cancels once more when a sealing row fell back to scanning before the re-read', async () => {
    const { row } = await stagedRow({
      state: 'sealing',
      workflowRunId: 'run-a',
      leaseUntil: LIVE_LEASE,
      sealingEnteredAt: START_MS,
    });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });
    const end = harness.store.end.bind(harness.store);
    let firstEnd = true;
    harness.store.end = async (input) => {
      const ended = await end(input);
      if (firstEnd) {
        firstEnd = false;
        await harness.store.returnToScanning({
          intakeId: row.id,
          runId: 'run-a',
          nowMs: START_MS,
        });
      }
      return ended;
    };

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'cancelled', row: { state: 'cancelled' } });
    expect(harness.store.calls.filter((call) => call.startsWith('end:'))).toHaveLength(2);
    expect(harness.store.row(row.id).state).toBe('cancelled');
  });

  it('answers a sealing row after one attempt', async () => {
    const { row } = await stagedRow({
      state: 'sealing',
      workflowRunId: 'run-a',
      leaseUntil: LIVE_LEASE,
      sealingEnteredAt: START_MS,
    });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'not_cancellable', row: { state: 'sealing' } });
    expect(harness.store.calls.filter((call) => call.startsWith('end:'))).toHaveLength(1);
  });

  it.each(['rejected', 'failed'] as const)('answers a %s row after one attempt', async (state) => {
    const { row } = await stagedRow({ state });
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'not_cancellable', row: { state } });
    expect(harness.store.calls.filter((call) => call.startsWith('end:'))).toHaveLength(1);
  });

  it('stops after two attempts when the row stays cancellable but keeps missing', async () => {
    const { row } = await stagedRow();
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });
    harness.store.end = async () => {
      harness.store.calls.push('end:cancelled');
      return null;
    };

    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'not_cancellable' });
    expect(harness.store.calls.filter((call) => call.startsWith('end:'))).toHaveLength(2);
  });

  it('answers a second cancel of the same row as cancelled', async () => {
    const { row } = await stagedRow();
    const harness = createIntakeHarness({ scanner: createFakeScanner({}), rows: [row] });

    await cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id });
    await expect(
      cancelChatFileIntake(harness.deps, { userId: row.userId, intakeId: row.id }),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
  });
});

describe('cancelIntakeByStagingKey', () => {
  function dbRow(row: ChatFileIntakeRow): Record<string, unknown> {
    return {
      id: row.id,
      user_id: row.userId,
      organization_id: row.organizationId,
      conversation_id: row.conversationId,
      temporary_chat: row.temporaryChat,
      file_name: row.fileName,
      mime_type: row.mimeType,
      byte_count: String(row.byteCount),
      declared_sha256: row.declaredSha256,
      staging_key: row.stagingKey,
      multipart_upload_id: row.multipartUploadId,
      part_bytes: row.partBytes,
      state: 'cancelled',
      refusal_code: null,
      failure_code: null,
      cancel_reason: 'client',
      attempts: 0,
      first_submitted_at: null,
      scan_budget_wait_ms: 0,
      sealing_entered_at: null,
      scan_job_id: null,
      workflow_run_id: null,
      etag: null,
      media_asset_id: null,
      daily_bytes_charged: String(row.dailyBytesCharged),
      bytes_refunded_at: null,
      lease_until: null,
      last_part_request_at: null,
      state_changed_at: new Date(START_MS).toISOString(),
      objects_purged_at: null,
      created_at: new Date(row.createdAt).toISOString(),
    };
  }

  it('refunds the bytes the parts never stored, once', async () => {
    const row = intakeRow({ state: 'awaiting_parts', createdAt: START_MS });
    const key = dailyBytesKey(row.userId, START_MS);
    await kv.increment(key, row.byteCount);
    let refunded = false;
    let cancelled = false;
    const { db, query } = createQueryDb(async (sql) => {
      if (sql.includes("set state = 'cancelled'")) {
        if (cancelled) return [];
        cancelled = true;
        return [dbRow(row)];
      }
      if (sql.includes('set bytes_refunded_at')) {
        if (refunded) return [];
        refunded = true;
        return [
          {
            user_id: row.userId,
            daily_bytes_charged: String(row.dailyBytesCharged),
            created_at: new Date(START_MS).toISOString(),
          },
        ];
      }
      throw new Error(`Unexpected statement: ${sql}`);
    });

    const first = await cancelIntakeByStagingKey(db, {
      userId: row.userId,
      stagingKey: row.stagingKey,
      storedBytes: 10 * MIB,
      nowMs: START_MS + 1_000,
    });
    const second = await cancelIntakeByStagingKey(db, {
      userId: row.userId,
      stagingKey: row.stagingKey,
      storedBytes: 10 * MIB,
      nowMs: START_MS + 2_000,
    });

    expect(first?.state).toBe('cancelled');
    expect(second).toBeNull();
    expect(await kv.get(key)).toBe(10 * MIB);
    const [cancelSql, cancelParams] = query.mock.calls[0]!;
    expect(cancelSql).toMatch(/i\.state = 'awaiting_parts'/);
    expect(cancelParams).toEqual([
      row.userId,
      row.stagingKey,
      new Date(START_MS + 1_000).toISOString(),
    ]);
  });

  it('does nothing to a row in any other state', async () => {
    const row = intakeRow({ state: 'scanning', createdAt: START_MS });
    const key = dailyBytesKey(row.userId, START_MS);
    await kv.increment(key, row.byteCount);
    const { db, query } = createQueryDb(async () => []);

    await expect(
      cancelIntakeByStagingKey(db, {
        userId: row.userId,
        stagingKey: row.stagingKey,
        storedBytes: 0,
        nowMs: START_MS,
      }),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(await kv.get(key)).toBe(row.byteCount);
  });
});

describe('insertIntake', () => {
  it('stamps created_at with the instant the daily bytes were charged, not the database clock', async () => {
    const chargedAtMs = Date.parse('2026-11-14T23:59:59.900Z');
    const { db } = createQueryDb(async (sql, params = []) => {
      const columns = /\(([^)]*)\)\s*values/
        .exec(sql)?.[1]
        ?.split(',')
        .map((c) => c.trim());
      const values = /values\s*\(([\s\S]*)\)\s*returning/
        .exec(sql)?.[1]
        ?.split(/,\s*(?=\$)/)
        .map((value) => params[Number(/\$(\d+)/.exec(value)?.[1]) - 1]);
      if (!columns || !values || columns.length !== values.length) {
        throw new Error('The insert names a column without a value.');
      }
      const now = new Date(Date.parse('2026-11-15T00:00:00.050Z')).toISOString();
      return [
        {
          ...Object.fromEntries(columns.map((column, index) => [column, values[index]])),
          id: '3f6a2c1e-9b8d-4e7f-a1b2-c3d4e5f60718',
          state: 'awaiting_parts',
          created_at: columns.includes('created_at') ? values[columns.indexOf('created_at')] : now,
        },
      ];
    });

    const row = await insertIntake(db, {
      userId: 'user-owner',
      organizationId: null,
      conversationId: null,
      temporaryChat: false,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      byteCount: 40 * MIB,
      declaredSha256: 'a'.repeat(64),
      stagingKey: 'chat-attachments/user-owner/1731000000000_abc.pdf',
      multipartUploadId: 'upload-1',
      partBytes: 8 * MIB,
      dailyBytesCharged: 40 * MIB,
      nowMs: chargedAtMs,
    });

    expect(row.createdAt).toBe(chargedAtMs);
    expect(row.lastPartRequestAt).toBe(chargedAtMs);
  });
});

function setRowEtag(row: ChatFileIntakeRow, etag: string) {
  row.etag = etag;
}
