// @vitest-environment node
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type CronAuthModule = typeof import('@/lib/server/cron-auth');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type KeyValueModule = typeof import('@/lib/server/key-value');
type StartChatFileIntakeWorkflowModule =
  typeof import('@/lib/workflows/start-chat-file-intake-workflow');
type StoreModule = typeof import('@/lib/server/chat-file-intake/store');
type TransitionsModule = typeof import('@/lib/server/chat-file-intake/transitions');
type ChatFilePreparationModule = typeof import('@/lib/server/chat-file-preparation');

const mocks = vi.hoisted(() => ({
  verifyCron: vi.fn(),
  getNeonDb: vi.fn(),
  getKeyValueStore: vi.fn(),
  dispatch: vi.fn(),
  listRedispatchable: vi.fn(),
  listIdle: vi.fn(),
  listStalled: vi.fn(),
  listUnpurged: vi.fn(),
  listPrunableSealing: vi.fn(),
  prune: vi.fn(),
  transitionDeps: vi.fn(),
  intakeObjects: vi.fn(),
  listOrphanedPreparations: vi.fn(),
  deleteOrphanedPreparation: vi.fn(),
  failStalledPreparations: vi.fn(),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', async (importOriginal) => ({
  ...(await importOriginal<CronAuthModule>()),
  verifyCronRequest: mocks.verifyCron,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: mocks.getKeyValueStore,
}));
vi.mock('@/lib/workflows/start-chat-file-intake-workflow', async (importOriginal) => ({
  ...(await importOriginal<StartChatFileIntakeWorkflowModule>()),
  dispatchChatFileIntakeWorkflows: mocks.dispatch,
  startChatFileIntakeWorkflow: vi.fn(),
}));
vi.mock('@/lib/server/chat-file-intake/store', async (importOriginal) => ({
  ...(await importOriginal<StoreModule>()),
  listRedispatchableIntakes: mocks.listRedispatchable,
  listIdleAwaitingPartsIntakes: mocks.listIdle,
  listStalledIntakes: mocks.listStalled,
  listUnpurgedTerminalIntakes: mocks.listUnpurged,
  listPrunableUnsealedSealingIntakes: mocks.listPrunableSealing,
  pruneTerminalIntakes: mocks.prune,
}));
vi.mock('@/lib/server/chat-file-intake/transitions', async (importOriginal) => ({
  ...(await importOriginal<TransitionsModule>()),
  defaultIntakeTransitionDeps: mocks.transitionDeps,
  defaultIntakeObjects: mocks.intakeObjects,
}));
vi.mock('@/lib/server/chat-file-preparation', async (importOriginal) => ({
  ...(await importOriginal<ChatFilePreparationModule>()),
  listOrphanedPreparations: mocks.listOrphanedPreparations,
  deleteOrphanedPreparation: mocks.deleteOrphanedPreparation,
  failStalledPreparations: mocks.failStalledPreparations,
}));

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { createSchemaAbsentDb } from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import {
  memoryObjectStore,
  objectExists,
  PRIVATE_BUCKET,
  putStagedFile,
  START_MS,
  stubMemoryObjectStorage,
} from '@/lib/server/chat-file-intake/__tests__/inline-executor';
import {
  createMemoryIntakeStore,
  intakeRow,
  type MemoryIntakeStore,
} from '@/lib/server/chat-file-intake/__tests__/memory-intake-store';
import { defaultIntakeObjects } from '@/lib/server/chat-file-intake/transitions';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { GET } from '../route';

const actualTransitions = await vi.importActual<
  typeof import('@/lib/server/chat-file-intake/transitions')
>('@/lib/server/chat-file-intake/transitions');
const { intake, preparation } = CHAT_LARGE_FILE_POLICY;
const MIB = 1024 * 1024;
const DAY_KEY = 'agi:chat-files:daily-bytes:user-owner:2026-11-15';

let kv: KeyValueStore;
let query: ReturnType<typeof vi.fn>;

function readyDb() {
  query = vi.fn(async (sql: string) => {
    if (/to_regclass/i.test(sql)) {
      return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
    }
    throw new Error(`The sweep sent a statement the test did not expect: ${sql}`);
  });
  return { query };
}

/** A route module of its own, so the schema answer it caches is not the one the other cases hold. */
async function freshGet() {
  vi.resetModules();
  return (await import('../route')).GET;
}

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/sweep-chat-file-intakes');
}

function bindStore(store: MemoryIntakeStore) {
  mocks.transitionDeps.mockReturnValue({
    store,
    objects: defaultIntakeObjects(),
    now: () => START_MS,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START_MS);
  stubMemoryObjectStorage();
  vi.stubEnv('AGI_DB_LOW_POWER', '');
  kv = createMemoryKeyValueStore();
  mocks.getKeyValueStore.mockReturnValue(kv);
  mocks.verifyCron.mockReturnValue(true);
  mocks.getNeonDb.mockReturnValue(readyDb());
  mocks.dispatch.mockResolvedValue({ started: 0, failed: 0 });
  for (const list of [
    mocks.listRedispatchable,
    mocks.listIdle,
    mocks.listStalled,
    mocks.listUnpurged,
    mocks.listPrunableSealing,
    mocks.listOrphanedPreparations,
    mocks.failStalledPreparations,
  ]) {
    list.mockResolvedValue([]);
  }
  mocks.prune.mockResolvedValue(0);
  mocks.intakeObjects.mockImplementation(actualTransitions.defaultIntakeObjects);
  bindStore(createMemoryIntakeStore());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GET /api/cron/sweep-chat-file-intakes', () => {
  it('refuses a request without the cron secret', async () => {
    mocks.verifyCron.mockReturnValue(false);
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'off', 'on'])(
    'runs the sweep on a ready schema and reports zeros with no rows while the flag is %s',
    async (flag) => {
      vi.stubEnv('CHAT_LARGE_FILES_ENABLED', flag);
      const response = await GET(cronRequest());

      await expect(response.json()).resolves.toEqual({
        redispatched: 0,
        redispatchFailed: 0,
        idleCancelled: 0,
        stalled: 0,
        purged: 0,
        orphanedPreparationsDeleted: 0,
        preparationsFailed: 0,
        pruned: 0,
      });
      for (const pass of [
        mocks.listRedispatchable,
        mocks.listIdle,
        mocks.listStalled,
        mocks.listUnpurged,
        mocks.listPrunableSealing,
        mocks.listOrphanedPreparations,
        mocks.failStalledPreparations,
        mocks.prune,
      ]) {
        expect(pass).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('still purges an ended row it finds with the flag unset', async () => {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', undefined);
    const row = intakeRow({ state: 'rejected', refusalCode: 'malware', stateChangedAt: 0 });
    await putStagedFile(row, new Uint8Array(8));
    bindStore(createMemoryIntakeStore([row]));
    mocks.listUnpurged.mockResolvedValue([row]);
    const body = await (await GET(cronRequest())).json();

    expect(body.purged).toBe(1);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('re-dispatches each intake whose lease has passed, in its owner’s scope', async () => {
    mocks.listRedispatchable.mockResolvedValue([
      { id: 'intake-1', userId: 'user-1', organizationId: null, state: 'sealing' },
      { id: 'intake-2', userId: 'user-2', organizationId: 'org-2', state: 'scanning' },
    ]);
    mocks.dispatch.mockResolvedValue({ started: 1, failed: 1 });
    const body = await (await GET(cronRequest())).json();

    expect(mocks.listRedispatchable).toHaveBeenCalledWith(expect.anything(), {
      nowMs: START_MS,
      limit: 50,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith([
      { intakeId: 'intake-1', userId: 'user-1', organizationId: null },
      { intakeId: 'intake-2', userId: 'user-2', organizationId: 'org-2' },
    ]);
    expect(body).toMatchObject({ redispatched: 1, redispatchFailed: 1 });
  });

  it('cancels an idle upload and gives back the bytes its parts never stored', async () => {
    const store = memoryObjectStore();
    const base = intakeRow({ state: 'awaiting_parts', createdAt: START_MS - 3 * 60 * 60_000 });
    const upload = await store.createMultipartUpload({
      bucket: PRIVATE_BUCKET,
      key: base.stagingKey,
      contentType: base.mimeType,
    });
    await store.uploadPart({ ...upload, partNumber: 1, body: new Uint8Array(5 * MIB) });
    const row = { ...base, multipartUploadId: upload.uploadId };
    const intakes = createMemoryIntakeStore([row]);
    bindStore(intakes);
    mocks.listIdle.mockResolvedValue([row]);
    await kv.increment(DAY_KEY, row.dailyBytesCharged);
    const body = await (await GET(cronRequest())).json();

    expect(mocks.listIdle).toHaveBeenCalledWith(expect.anything(), {
      idleBeforeMs: START_MS - intake.awaitingPartsIdleMs,
      limit: 100,
    });
    expect(body.idleCancelled).toBe(1);
    expect(intakes.row(row.id)).toMatchObject({ state: 'cancelled', cancelReason: 'idle' });
    expect(await kv.get(DAY_KEY)).toBe(5 * MIB);
    await expect(store.listUploadedParts(upload)).rejects.toThrow();
  });

  it('fails an intake that has not moved within the abandon window, deleting its objects', async () => {
    const row = intakeRow({
      state: 'scanning',
      workflowRunId: 'run-gone',
      stateChangedAt: START_MS - intake.abandonAfterMs - 1,
      sealingEnteredAt: START_MS - intake.abandonAfterMs - 1,
    });
    await putStagedFile(row, new Uint8Array(8));
    const intakes = createMemoryIntakeStore([row]);
    bindStore(intakes);
    mocks.listStalled.mockResolvedValue([row]);
    const body = await (await GET(cronRequest())).json();

    expect(mocks.listStalled).toHaveBeenCalledWith(expect.anything(), {
      changedBeforeMs: START_MS - intake.abandonAfterMs,
      limit: 100,
    });
    expect(body.stalled).toBe(1);
    expect(intakes.row(row.id)).toMatchObject({ state: 'failed', failureCode: 'stalled' });
    expect(intakes.row(row.id).objectsPurgedAt).toBe(START_MS);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('purges what an ended intake left behind once the sealing lease has passed', async () => {
    const row = intakeRow({ state: 'rejected', refusalCode: 'malware', stateChangedAt: 0 });
    await putStagedFile(row, new Uint8Array(8));
    const intakes = createMemoryIntakeStore([row]);
    bindStore(intakes);
    mocks.listUnpurged.mockResolvedValue([row]);
    const body = await (await GET(cronRequest())).json();

    expect(mocks.listUnpurged).toHaveBeenCalledWith(expect.anything(), {
      changedBeforeMs: START_MS - intake.leaseMs.sealing,
      limit: 100,
    });
    expect(body.purged).toBe(1);
    expect(await objectExists(row.stagingKey)).toBe(false);
  });

  it('ends, stalls and purges each row through a store bound to that row’s owner', async () => {
    const idle = intakeRow({
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'user-idle',
      state: 'awaiting_parts',
      multipartUploadId: null,
    });
    const stuck = intakeRow({
      id: '44444444-4444-4444-8444-444444444444',
      userId: 'user-stuck',
      state: 'scanning',
      workflowRunId: 'run-gone',
    });
    const ended = intakeRow({
      id: '55555555-5555-4555-8555-555555555555',
      userId: 'user-ended',
      state: 'rejected',
      refusalCode: 'malware',
    });
    const db = readyDb();
    mocks.getNeonDb.mockReturnValue(db);
    const intakes = createMemoryIntakeStore([idle, stuck, ended]);
    const owners: unknown[] = [];
    mocks.transitionDeps.mockImplementation((boundDb: unknown, ownerUserId: unknown) => {
      expect(boundDb).toBe(db);
      owners.push(ownerUserId);
      return { store: intakes, objects: defaultIntakeObjects(), now: () => START_MS };
    });
    mocks.listIdle.mockResolvedValue([idle]);
    mocks.listStalled.mockResolvedValue([stuck]);
    mocks.listUnpurged.mockResolvedValue([ended]);

    const body = await (await GET(cronRequest())).json();

    expect(body).toMatchObject({ idleCancelled: 1, stalled: 1, purged: 1 });
    expect(owners).toEqual(['user-idle', 'user-stuck', 'user-ended']);
  });

  it('deletes an orphaned preparation only once every derived object under its prefix is gone', async () => {
    const store = memoryObjectStore();
    const own = 'chat-derived/user-owner/asset-1/v1/text/0001.txt';
    const foreign = 'chat-derived/user-other/asset-9/v1/text/0001.txt';
    for (const key of [own, foreign]) {
      await store.put({
        bucket: PRIVATE_BUCKET,
        key,
        body: new Uint8Array(1),
        contentType: 'text/plain',
      });
    }
    mocks.listOrphanedPreparations.mockResolvedValue([
      { id: 'prep-1', userId: 'user-owner', derivedKeys: [own], updatedAt: 'x' },
      { id: 'prep-2', userId: 'user-owner', derivedKeys: [foreign], updatedAt: 'y' },
    ]);
    mocks.deleteOrphanedPreparation.mockResolvedValue(true);
    mocks.failStalledPreparations.mockResolvedValue(['prep-3']);
    const body = await (await GET(cronRequest())).json();

    expect(await objectExists(own)).toBe(false);
    expect(await objectExists(foreign)).toBe(true);
    expect(mocks.deleteOrphanedPreparation).toHaveBeenCalledTimes(1);
    expect(mocks.deleteOrphanedPreparation.mock.calls[0]![1]).toMatchObject({ id: 'prep-1' });
    expect(mocks.failStalledPreparations).toHaveBeenCalledWith(expect.anything(), {
      stalledForMs: preparation.stallMs,
      limit: 100,
    });
    expect(body).toMatchObject({ orphanedPreparationsDeleted: 1, preparationsFailed: 1 });
  });

  it('prunes ended rows after the retention window', async () => {
    mocks.prune.mockResolvedValue(2);
    const body = await (await GET(cronRequest())).json();

    expect(mocks.prune).toHaveBeenCalledWith(expect.anything(), {
      endedBeforeMs: START_MS - intake.terminalRetentionMs,
      limit: 500,
      sealedKeyClearedIds: [],
    });
    expect(body.pruned).toBe(2);
  });

  it('deletes a late sealed copy of an unsealed row again before pruning it, and keeps a row whose delete failed', async () => {
    const landed = intakeRow({ id: '11111111-1111-4111-8111-111111111111' });
    const failing = intakeRow({
      id: '22222222-2222-4222-8222-222222222222',
      stagingKey: 'chat-attachments/user-owner/1731000000001_failing.pdf',
    });
    const landedKey = sealedChatAttachmentPathname(landed.stagingKey);
    await memoryObjectStore().put({
      bucket: PRIVATE_BUCKET,
      key: landedKey,
      body: new Uint8Array(8),
      contentType: landed.mimeType,
    });
    const objects = actualTransitions.defaultIntakeObjects();
    mocks.intakeObjects.mockReturnValue({
      ...objects,
      delete: async (key: string) => {
        if (key === sealedChatAttachmentPathname(failing.stagingKey)) {
          throw new Error('storage down');
        }
        return objects.delete(key);
      },
    });
    mocks.listPrunableSealing.mockResolvedValue([
      { id: landed.id, stagingKey: landed.stagingKey },
      { id: failing.id, stagingKey: failing.stagingKey },
    ]);
    mocks.prune.mockResolvedValue(1);
    await GET(cronRequest());

    expect(mocks.listPrunableSealing).toHaveBeenCalledWith(expect.anything(), {
      endedBeforeMs: START_MS - intake.terminalRetentionMs,
      limit: 500,
    });
    expect(await objectExists(landedKey)).toBe(false);
    expect(mocks.prune).toHaveBeenCalledWith(expect.anything(), {
      endedBeforeMs: START_MS - intake.terminalRetentionMs,
      limit: 500,
      sealedKeyClearedIds: [landed.id],
    });
  });

  it('answers 500 when the sweep fails', async () => {
    mocks.listRedispatchable.mockRejectedValue(new Error('database down'));
    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
  });
});

describe('GET /api/cron/sweep-chat-file-intakes before migration 0422', () => {
  it.each([undefined, 'on'])(
    'does nothing on a database without migration 0422 while the flag is %s',
    async (flag) => {
      vi.stubEnv('CHAT_LARGE_FILES_ENABLED', flag);
      const delegate = vi.fn(async () => {
        throw new Error('No statement should reach the database.');
      });
      mocks.getNeonDb.mockReturnValue(createSchemaAbsentDb({ query: delegate }));
      const GET = await freshGet();

      const response = await GET(cronRequest());

      await expect(response.json()).resolves.toEqual({ skipped: 'schema_absent' });
      expect(delegate).not.toHaveBeenCalled();
      expect(mocks.listRedispatchable).not.toHaveBeenCalled();
      expect(mocks.listOrphanedPreparations).not.toHaveBeenCalled();
      expect(mocks.prune).not.toHaveBeenCalled();
    },
  );
});
