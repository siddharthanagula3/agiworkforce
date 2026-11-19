import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryObjectStore,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_PROVIDER_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { eraseChatFiles } from '../erasure';
import { createQueryDb } from './fake-query-db';
import { createSchemaAbsentDb } from './schema-absent-db';
import { getObjectStore } from '@/lib/server/object-storage-runtime';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { relaySegmentKey } from '@/app/api/files/uploads/relay-segments';

const PRIVATE_BUCKET = 'chat-files-private-test';
const USER = 'user-1';
const OTHER_USER = 'user-2';
const ORGANIZATION = '0b6f3c1e-7d2a-4c55-9a51-3f7e2b9d8c10';
const OTHER_ORGANIZATION = '5d9e0a4b-1c3f-4e8d-8b27-6a1f0c2e9d33';

interface IntakeRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  staging_key: string;
  multipart_upload_id: string | null;
  state: string;
  sealing_entered_at: string | null;
}

interface PreparationRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  derived_keys: string[];
  updated_at: string;
}

const STATES = [
  'awaiting_parts',
  'uploaded',
  'inspecting',
  'scanning',
  'sealing',
  'sealed',
  'rejected',
  'failed',
  'cancelled',
] as const;

const SEALING_ENTERED = new Set(['sealing', 'sealed', 'rejected', 'failed']);

function inScope(
  row: { user_id: string; organization_id: string | null },
  userId: unknown,
  organizationId: unknown,
): boolean {
  return (
    row.user_id === userId || (organizationId !== null && row.organization_id === organizationId)
  );
}

function createChatFileDb(seed: { intakes: IntakeRow[]; preparations: PreparationRow[] }) {
  const tables = {
    chat_file_intakes: seed.intakes.map((row) => ({ ...row })),
    chat_file_preparations: seed.preparations.map((row) => ({ ...row })),
  };
  const statements: string[] = [];
  const { db, query } = createQueryDb(async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    statements.push(text);
    if (text.includes('to_regclass(')) {
      return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
    }
    const name = text.includes('public.chat_file_intakes')
      ? 'chat_file_intakes'
      : text.includes('public.chat_file_preparations')
        ? 'chat_file_preparations'
        : null;
    if (name === null) throw new Error(`Unexpected statement: ${text}`);
    const rows: Array<IntakeRow | PreparationRow> = tables[name];
    if (text.startsWith('select count(*)')) {
      const [userId, organizationId] = params;
      return [{ remaining: rows.filter((row) => inScope(row, userId, organizationId)).length }];
    }
    if (text.startsWith('select ')) {
      const [userId, organizationId] = params;
      return rows.filter((row) => inScope(row, userId, organizationId)).map((row) => ({ ...row }));
    }
    if (text.startsWith('delete from ')) {
      const [id, userId, organizationId, ...readAs] = params;
      const unchanged = (row: IntakeRow | PreparationRow): boolean => {
        if ('staging_key' in row) {
          const [state, sealingNotEntered, multipartUploadId] = readAs;
          return (
            row.state === state &&
            (row.sealing_entered_at === null) === sealingNotEntered &&
            row.multipart_upload_id === multipartUploadId
          );
        }
        return (
          JSON.stringify(row.derived_keys) === JSON.stringify(readAs[0]) &&
          row.updated_at === readAs[1]
        );
      };
      const removed = rows.filter(
        (row) => row.id === id && inScope(row, userId, organizationId) && unchanged(row),
      );
      (tables as Record<string, unknown[]>)[name] = rows.filter((row) => !removed.includes(row));
      return removed.map((row) => ({ id: row.id }));
    }
    throw new Error(`Unexpected statement: ${text}`);
  });
  return { db, query, tables, statements };
}

function memoryStore(): MemoryObjectStore {
  const store = getObjectStore();
  if (!(store instanceof MemoryObjectStore)) throw new Error('The test store is not in memory.');
  return store;
}

function stagingKey(userId: string, name: string): string {
  return `chat-attachments/${userId}/${name}.pdf`;
}

async function putObject(key: string): Promise<void> {
  await memoryStore().put({
    bucket: PRIVATE_BUCKET,
    key,
    body: new TextEncoder().encode(key),
    contentType: 'application/octet-stream',
  });
}

async function exists(key: string): Promise<boolean> {
  return (await memoryStore().head(PRIVATE_BUCKET, key)) !== null;
}

async function openUpload(key: string): Promise<string> {
  const handle = await memoryStore().createMultipartUpload({
    bucket: PRIVATE_BUCKET,
    key,
    contentType: 'application/pdf',
  });
  return handle.uploadId;
}

async function pendingUploads(prefix = 'chat-attachments/'): Promise<string[]> {
  return (await memoryStore().listPendingMultipartUploads(PRIVATE_BUCKET, prefix)).map(
    (upload) => upload.key,
  );
}

interface SeededOwner {
  intakes: IntakeRow[];
  preparations: PreparationRow[];
  objects: string[];
}

async function seedOwner(
  owner: { userId: string; organizationId: string | null },
  label: string,
): Promise<SeededOwner> {
  const intakes: IntakeRow[] = [];
  const objects: string[] = [];
  for (const [index, state] of STATES.entries()) {
    const key = stagingKey(owner.userId, `${label}-${state}`);
    const multipartUploadId = state === 'awaiting_parts' ? await openUpload(key) : null;
    if (state !== 'awaiting_parts') {
      await putObject(key);
      objects.push(key);
    }
    const sealingEntered = SEALING_ENTERED.has(state);
    if (sealingEntered && state !== 'sealed') {
      await putObject(sealedChatAttachmentPathname(key));
      objects.push(sealedChatAttachmentPathname(key));
    }
    intakes.push({
      id: `${label}-intake-${index}`,
      user_id: owner.userId,
      organization_id: owner.organizationId,
      staging_key: key,
      multipart_upload_id: multipartUploadId,
      state,
      sealing_entered_at: sealingEntered ? '2026-11-15T10:00:00.000Z' : null,
    });
  }
  const derivedKeys = [
    `chat-derived/${owner.userId}/${label}/v1/text/0001.txt`,
    `chat-derived/${owner.userId}/${label}/v1/text/0002.txt`,
  ];
  for (const key of derivedKeys) {
    await putObject(key);
    objects.push(key);
  }
  return {
    intakes,
    preparations: [
      {
        id: `${label}-preparation`,
        user_id: owner.userId,
        organization_id: owner.organizationId,
        derived_keys: derivedKeys,
        updated_at: '2026-11-15 10:00:00.123456+00',
      },
    ],
    objects,
  };
}

beforeEach(() => {
  vi.stubEnv(OBJECT_STORAGE_PROVIDER_ENV, 'memory');
  vi.stubEnv(OBJECT_STORAGE_ENDPOINT_ENV, 'http://127.0.0.1:1');
  vi.stubEnv(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, 'test-access-key');
  vi.stubEnv(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, 'test-secret-key');
  vi.stubEnv(OBJECT_STORAGE_BUCKET_ENV, 'chat-files-public-test');
  vi.stubEnv(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, PRIVATE_BUCKET);
  memoryStore().clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('eraseChatFiles', () => {
  it('reports both tables deleted and sends nothing else when 0422 is not applied', async () => {
    const delegate = {
      query: vi.fn(async () => {
        throw new Error('nothing but the schema probe may run');
      }),
    };

    const report = await eraseChatFiles(createSchemaAbsentDb(delegate), { userId: USER });

    expect(report.tables).toEqual({
      chat_file_intakes: { deleted: true },
      chat_file_preparations: { deleted: true },
    });
    expect(delegate.query).not.toHaveBeenCalled();
  });

  it('leaves a user no row, no staging or unsealed object, no derived object and no open upload', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const theirs = await seedOwner({ userId: OTHER_USER, organizationId: null }, 'theirs');
    const strayUpload = stagingKey(USER, 'stray-without-a-row');
    await openUpload(strayUpload);
    const { db, tables } = createChatFileDb({
      intakes: [...mine.intakes, ...theirs.intakes],
      preparations: [...mine.preparations, ...theirs.preparations],
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables).toEqual({
      chat_file_intakes: { deleted: true },
      chat_file_preparations: { deleted: true },
    });
    expect(report.objectsFailed).toBe(0);
    expect(report.uploadsAborted).toBe(2);
    expect(tables.chat_file_intakes.filter((row) => row.user_id === USER)).toEqual([]);
    expect(tables.chat_file_preparations.filter((row) => row.user_id === USER)).toEqual([]);
    for (const key of mine.objects) expect(await exists(key), key).toBe(false);
    expect(await pendingUploads(`chat-attachments/${USER}/`)).toEqual([]);

    expect(tables.chat_file_intakes).toHaveLength(STATES.length);
    for (const key of theirs.objects) expect(await exists(key), key).toBe(true);
    expect(await pendingUploads(`chat-attachments/${OTHER_USER}/`)).toHaveLength(1);
  });

  it("leaves a sealed file's sealed copy to the media erasure that owns it", async () => {
    const key = stagingKey(USER, 'sealed');
    await putObject(sealedChatAttachmentPathname(key));
    const { db } = createChatFileDb({
      intakes: [
        {
          id: 'sealed-intake',
          user_id: USER,
          organization_id: null,
          staging_key: key,
          multipart_upload_id: null,
          state: 'sealed',
          sealing_entered_at: '2026-11-15T10:00:00.000Z',
        },
      ],
      preparations: [],
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: true });
    expect(await exists(sealedChatAttachmentPathname(key))).toBe(true);
  });

  it('leaves an organization no row, no object and no open upload, and spares its members personal files', async () => {
    const member = OTHER_USER;
    const workspace = await seedOwner({ userId: member, organizationId: ORGANIZATION }, 'work');
    const personal = await seedOwner({ userId: member, organizationId: null }, 'personal');
    const elsewhere = await seedOwner({ userId: USER, organizationId: OTHER_ORGANIZATION }, 'else');
    const { db, tables } = createChatFileDb({
      intakes: [...workspace.intakes, ...personal.intakes, ...elsewhere.intakes],
      preparations: [
        ...workspace.preparations,
        ...personal.preparations,
        ...elsewhere.preparations,
      ],
    });

    const report = await eraseChatFiles(db, { organizationId: ORGANIZATION });

    expect(report.tables).toEqual({
      chat_file_intakes: { deleted: true },
      chat_file_preparations: { deleted: true },
    });
    expect(report.uploadsAborted).toBe(1);
    expect(tables.chat_file_intakes.filter((row) => row.organization_id === ORGANIZATION)).toEqual(
      [],
    );
    expect(
      tables.chat_file_preparations.filter((row) => row.organization_id === ORGANIZATION),
    ).toEqual([]);
    for (const key of workspace.objects) expect(await exists(key), key).toBe(false);
    const workspaceUpload = workspace.intakes.find((row) => row.multipart_upload_id !== null);
    expect(await pendingUploads()).not.toContain(workspaceUpload?.staging_key);

    for (const key of [...personal.objects, ...elsewhere.objects]) {
      expect(await exists(key), key).toBe(true);
    }
    expect(await pendingUploads()).toHaveLength(2);
    expect(tables.chat_file_intakes).toHaveLength(STATES.length * 2);
  });

  it('removes every segment relayed in the organization, by members and former members, and leaves the rest', async () => {
    const segment = (userId: string, organizationId: string | null, uploadId: string) =>
      relaySegmentKey({ userId, organizationId, uploadId }, 1, 0);
    const inWorkspace = segment(OTHER_USER, ORGANIZATION, 'upload-a');
    const formerMember = segment(USER, ORGANIZATION, 'upload-d');
    const personal = segment(OTHER_USER, null, 'upload-b');
    const elsewhere = segment(OTHER_USER, OTHER_ORGANIZATION, 'upload-c');
    for (const key of [inWorkspace, formerMember, personal, elsewhere]) await putObject(key);
    const { db } = createChatFileDb({ intakes: [], preparations: [] });

    const report = await eraseChatFiles(db, { organizationId: ORGANIZATION });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: true });
    expect(report.objectsDeleted).toBe(2);
    for (const key of [inWorkspace, formerMember]) expect(await exists(key), key).toBe(false);
    for (const key of [personal, elsewhere]) expect(await exists(key), key).toBe(true);
  });

  it('removes every segment a person relayed, in any workspace, even before the intake tables exist', async () => {
    const own = [
      relaySegmentKey({ userId: USER, organizationId: null, uploadId: 'upload-a' }, 1, 0),
      relaySegmentKey({ userId: USER, organizationId: ORGANIZATION, uploadId: 'upload-b' }, 3, 0),
    ];
    const someoneElse = relaySegmentKey(
      { userId: OTHER_USER, organizationId: null, uploadId: 'upload-c' },
      1,
      0,
    );
    for (const key of [...own, someoneElse]) await putObject(key);
    const delegate = { query: vi.fn(async () => []) };

    const report = await eraseChatFiles(createSchemaAbsentDb(delegate), { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: true });
    expect(report.objectsDeleted).toBe(2);
    for (const key of own) expect(await exists(key), key).toBe(false);
    expect(await exists(someoneElse)).toBe(true);
  });

  it('keeps the intakes for retry when the relayed segments cannot be listed', async () => {
    vi.spyOn(memoryStore(), 'listObjects').mockRejectedValue(new Error('storage unavailable'));
    const delegate = { query: vi.fn(async () => []) };

    const report = await eraseChatFiles(createSchemaAbsentDb(delegate), { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({
      deleted: false,
      retainedForRetry: true,
      error: 'Relayed upload segments could not all be removed',
    });
    expect(report.tables.chat_file_preparations).toEqual({ deleted: true });
  });

  it('keeps for retry only the intake whose object delete failed, and erases every other one', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb(mine);
    const store = memoryStore();
    const failingRow = mine.intakes.find((row) => row.state === 'scanning')!;
    const failing = failingRow.staging_key;
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      if (key === failing) throw new Error('storage unavailable');
      return realDelete(bucket, key);
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: false, retainedForRetry: true });
    expect(report.tables.chat_file_preparations).toEqual({ deleted: true });
    expect(report.objectsFailed).toBe(1);
    expect(tables.chat_file_intakes.map((row) => row.id)).toEqual([failingRow.id]);
    expect(await exists(failing)).toBe(true);
    for (const key of mine.objects.filter((key) => key !== failing)) {
      expect(await exists(key), key).toBe(false);
    }
    expect(await pendingUploads()).toEqual([]);
  });

  it('deletes each preparation as soon as its own derived objects are gone', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const kept = mine.preparations[0]!;
    const finishedKey = `chat-derived/${USER}/finished/v1/text/0001.txt`;
    await putObject(finishedKey);
    const { db, tables } = createChatFileDb({
      intakes: [],
      preparations: [
        kept,
        {
          id: 'finished-preparation',
          user_id: USER,
          organization_id: null,
          derived_keys: [finishedKey],
          updated_at: '2026-11-15 10:00:00.123456+00',
        },
      ],
    });
    const store = memoryStore();
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      if (key === kept.derived_keys[0]) throw new Error('storage unavailable');
      return realDelete(bucket, key);
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_preparations).toEqual({
      deleted: false,
      retainedForRetry: true,
    });
    expect(tables.chat_file_preparations.map((row) => row.id)).toEqual([kept.id]);
    expect(await exists(finishedKey)).toBe(false);
  });

  it('keeps an intake that entered sealing after it was read, and erases its copy on the next run', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb(mine);
    const racing = mine.intakes.find((row) => row.state === 'scanning')!;
    const sealedCopy = sealedChatAttachmentPathname(racing.staging_key);
    const store = memoryStore();
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      if (key === racing.staging_key) {
        const row = tables.chat_file_intakes.find((candidate) => candidate.id === racing.id)!;
        if (row.state === 'scanning') {
          row.state = 'sealing';
          row.sealing_entered_at = '2026-11-15T11:00:00.000Z';
          await putObject(sealedCopy);
        }
      }
      return realDelete(bucket, key);
    });

    const first = await eraseChatFiles(db, { userId: USER });

    expect(first.tables.chat_file_intakes).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(tables.chat_file_intakes.map((row) => row.id)).toEqual([racing.id]);
    expect(await exists(sealedCopy)).toBe(true);

    const second = await eraseChatFiles(db, { userId: USER });

    expect(second.tables.chat_file_intakes).toEqual({ deleted: true });
    expect(tables.chat_file_intakes.filter((row) => row.user_id === USER)).toEqual([]);
    expect(await exists(sealedCopy)).toBe(false);
  });

  it('keeps a preparation whose derived keys grew after it was read, and erases the new key on the next run', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb({ intakes: [], preparations: mine.preparations });
    const appended = `chat-derived/${USER}/mine/v1/text/0003.txt`;
    const store = memoryStore();
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      const row = tables.chat_file_preparations[0];
      if (row && key === row.derived_keys[0] && !row.derived_keys.includes(appended)) {
        await putObject(appended);
        row.derived_keys = [...row.derived_keys, appended];
      }
      return realDelete(bucket, key);
    });

    const first = await eraseChatFiles(db, { userId: USER });

    expect(first.tables.chat_file_preparations).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(tables.chat_file_preparations).toHaveLength(1);
    expect(await exists(appended)).toBe(true);

    const second = await eraseChatFiles(db, { userId: USER });

    expect(second.tables.chat_file_preparations).toEqual({ deleted: true });
    expect(tables.chat_file_preparations).toEqual([]);
    expect(await exists(appended)).toBe(false);
  });

  it('keeps a preparation whose updated_at moved after it was read though its derived keys did not', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb({ intakes: [], preparations: mine.preparations });
    const store = memoryStore();
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      const row = tables.chat_file_preparations[0];
      if (row && row.updated_at === '2026-11-15 10:00:00.123456+00') {
        row.updated_at = '2026-11-15 10:00:01.654321+00';
      }
      return realDelete(bucket, key);
    });

    const first = await eraseChatFiles(db, { userId: USER });

    expect(first.tables.chat_file_preparations).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(tables.chat_file_preparations).toHaveLength(1);

    const second = await eraseChatFiles(db, { userId: USER });

    expect(second.tables.chat_file_preparations).toEqual({ deleted: true });
    expect(tables.chat_file_preparations).toEqual([]);
  });

  it('keeps the row and the object when a staging or derived key lies outside its owner prefix', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const theirs = await seedOwner({ userId: OTHER_USER, organizationId: null }, 'theirs');
    const foreignStaging = theirs.intakes.find((row) => row.state === 'uploaded')!;
    const foreignDerived = theirs.preparations[0]!.derived_keys[0]!;
    const { db, tables } = createChatFileDb({
      intakes: [{ ...mine.intakes[1]!, staging_key: foreignStaging.staging_key }],
      preparations: [{ ...mine.preparations[0]!, derived_keys: [foreignDerived] }],
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(report.tables.chat_file_preparations).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(report.objectsFailed).toBeGreaterThanOrEqual(2);
    expect(tables.chat_file_intakes).toHaveLength(1);
    expect(tables.chat_file_preparations).toHaveLength(1);
    expect(await exists(foreignStaging.staging_key)).toBe(true);
    expect(await exists(foreignDerived)).toBe(true);
  });

  it('treats a derived key under an id the key builder refuses as outside the owner prefix', async () => {
    const odd = 'user/../user-2';
    const key = `chat-derived/${odd}/x/v1/text/0001.txt`;
    await putObject(key);
    const { db, tables } = createChatFileDb({
      intakes: [],
      preparations: [
        {
          id: 'odd-preparation',
          user_id: odd,
          organization_id: null,
          derived_keys: [key],
          updated_at: '2026-11-15 10:00:00.123456+00',
        },
      ],
    });

    const report = await eraseChatFiles(db, { userId: odd });

    expect(report.tables.chat_file_preparations).toMatchObject({ retainedForRetry: true });
    expect(tables.chat_file_preparations).toHaveLength(1);
    expect(await exists(key)).toBe(true);
  });

  it('reads updated_at as text and sends it back unchanged with the preparation delete', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, query, statements } = createChatFileDb({
      intakes: [],
      preparations: mine.preparations,
    });

    await eraseChatFiles(db, { userId: USER });

    expect(statements.some((text) => text.includes('updated_at::text as updated_at'))).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('updated_at = $5::timestamptz'),
      expect.arrayContaining(['2026-11-15 10:00:00.123456+00']),
    );
  });

  it('ends the open upload of an intake before it deletes the key, so a completing upload cannot slip between them', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db } = createChatFileDb({ intakes: mine.intakes, preparations: [] });
    const awaiting = mine.intakes.find((row) => row.state === 'awaiting_parts')!;
    const store = memoryStore();
    const order: string[] = [];
    const realAbort = store.abortMultipartUpload.bind(store);
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'abortMultipartUpload').mockImplementation(async (input) => {
      order.push(`abort:${input.key}`);
      return realAbort(input);
    });
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      order.push(`delete:${key}`);
      return realDelete(bucket, key);
    });

    await eraseChatFiles(db, { userId: USER });

    expect(order.indexOf(`abort:${awaiting.staging_key}`)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(`abort:${awaiting.staging_key}`)).toBeLessThan(
      order.indexOf(`delete:${awaiting.staging_key}`),
    );
  });

  it('keeps a preparation row for retry while one of its derived objects survives', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb(mine);
    const store = memoryStore();
    const failing = mine.preparations[0]!.derived_keys[1]!;
    const realDelete = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (bucket, key) => {
      if (key === failing) throw new Error('storage unavailable');
      return realDelete(bucket, key);
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_preparations).toEqual({
      deleted: false,
      retainedForRetry: true,
    });
    expect(report.tables.chat_file_intakes).toEqual({ deleted: true });
    expect(tables.chat_file_preparations).toHaveLength(1);
  });

  it('keeps for retry the intake whose open upload cannot be aborted', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb(mine);
    vi.spyOn(memoryStore(), 'abortMultipartUpload').mockRejectedValue(new Error('throttled'));

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: false, retainedForRetry: true });
    expect(tables.chat_file_intakes.map((row) => row.state)).toEqual(['awaiting_parts']);
    expect(await pendingUploads()).toHaveLength(1);
  });

  it('keeps the intakes table for retry when a stray upload under the user cannot be aborted', async () => {
    const strayUpload = stagingKey(USER, 'stray-without-a-row');
    await openUpload(strayUpload);
    const { db } = createChatFileDb({ intakes: [], preparations: [] });
    vi.spyOn(memoryStore(), 'abortMultipartUpload').mockRejectedValue(new Error('throttled'));

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toEqual({ deleted: false, retainedForRetry: true });
    expect(await pendingUploads()).toEqual([strayUpload]);
  });

  it('keeps every row for retry when private storage is not configured', async () => {
    const mine = await seedOwner({ userId: USER, organizationId: null }, 'mine');
    const { db, tables } = createChatFileDb(mine);
    vi.stubEnv(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, '');

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables).toEqual({
      chat_file_intakes: { deleted: false, retainedForRetry: true },
      chat_file_preparations: { deleted: false, retainedForRetry: true },
    });
    expect(tables.chat_file_intakes).toHaveLength(STATES.length);
    expect(tables.chat_file_preparations).toHaveLength(1);
  });

  it('keeps both tables for retry when the schema cannot be probed', async () => {
    const report = await eraseChatFiles(
      {
        query: vi.fn(async () => {
          throw new Error('connection reset');
        }),
      },
      { userId: USER },
    );

    expect(report.tables).toEqual({
      chat_file_intakes: { deleted: false, retainedForRetry: true, error: 'connection reset' },
      chat_file_preparations: {
        deleted: false,
        retainedForRetry: true,
        error: 'connection reset',
      },
    });
  });

  it('reports a table retained when a row arrived while it was being erased', async () => {
    const { db, query, tables } = createChatFileDb({ intakes: [], preparations: [] });
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('select count(*)') && sql.includes('chat_file_intakes')) {
        tables.chat_file_intakes.push({
          id: 'late',
          user_id: USER,
          organization_id: null,
          staging_key: stagingKey(USER, 'late'),
          multipart_upload_id: null,
          state: 'uploaded',
          sealing_entered_at: null,
        });
      }
      return original(sql, params);
    });

    const report = await eraseChatFiles(db, { userId: USER });

    expect(report.tables.chat_file_intakes).toMatchObject({
      deleted: false,
      retainedForRetry: true,
    });
    expect(report.tables.chat_file_preparations).toEqual({ deleted: true });
  });
});
