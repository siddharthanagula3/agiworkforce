// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { createSchemaAbsentDb } from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import {
  countSavedOcrPages,
  isOcrPageListed,
  deleteOrphanedPreparation,
  failStalledPreparations,
  listOrphanedPreparations,
  prepareChatFileStep,
  readPreparedCard,
  readPreparedPage,
  readPreparedText,
  recordPreparedIndexedChars,
  savePreparedPageText,
  sumIndexedCharsForUser,
  type OrphanedPreparation,
  type PreparedReaderDeps,
} from '..';
import { ocrPageKey, preparationKeyPrefix, textSegmentKey } from '../derived-keys';
import {
  advancePreparation,
  findPreparationById,
  listPreparationKeys,
  type PreparationAdvance,
} from '../progress-store';
import {
  buildPdf,
  createCountingStorage,
  FakePreparationDb,
  prepareUntilDone,
  storeSource,
  testUuid,
  USER,
  type CountingStorage,
} from './preparation-harness';

const MIB = 1024 * 1024;
const SCHEMA_ANSWER_TTL_MS = 10 * 60_000;
const STEP_BYTES = 2 * MIB;
const SMALL_STEP_POLICY = {
  ...CHAT_LARGE_FILE_POLICY,
  kinds: {
    ...CHAT_LARGE_FILE_POLICY.kinds,
    text: { ...CHAT_LARGE_FILE_POLICY.kinds.text, bytesPerStep: STEP_BYTES },
  },
};

function largeText(): Buffer {
  const line = 'The quarterly ledger lists every harbor fee by month and vessel.\n';
  return Buffer.from(
    line.repeat(Math.ceil((MAX_CHAT_ATTACHMENT_BYTES + 2 * MIB) / line.length)),
    'utf8',
  );
}

async function sealedText(db: FakePreparationDb, storage: CountingStorage, data: Buffer) {
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.txt.sealed`;
  await storeSource(storage, key, data, 'text/plain');
  db.addAsset({
    id,
    mime_type: 'text/plain',
    storage_pathname: key,
    filename: 'ledger.txt',
    byte_size: data.byteLength,
  });
  return id;
}

describe('preparation progress', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('moves updated_at with every cursor advance', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    const seen: number[] = [];

    for (;;) {
      db.tick(60_000);
      const result = await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
      seen.push(db.rowForAsset(id)!.updated_at.getTime());
      if (result.done) break;
    }

    expect(seen.length).toBe(4);
    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]).toBeGreaterThan(seen[index - 1]!);
    }
    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready_partial' });
  });

  it('a retried half-written step writes the same keys and records each once', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const before = [...db.rowForAsset(id)!.derived_keys];
    const putsBefore = storage.stats.puts.length;

    db.failNextAdvance = true;
    await expect(
      prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY }),
    ).rejects.toThrow('connection reset');
    const halfWritten = storage.stats.puts.slice(putsBefore);
    expect(halfWritten.length).toBeGreaterThan(0);
    expect(db.rowForAsset(id)!.derived_keys).toEqual([...before, ...halfWritten]);

    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const retried = storage.stats.puts.slice(putsBefore + halfWritten.length);
    expect(retried).toEqual(halfWritten);
    const keys = db.rowForAsset(id)!.derived_keys;
    expect(keys).toEqual([...before, ...halfWritten]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a step whose compare-and-set finds no row deletes the objects it wrote', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const recorded = [...db.rowForAsset(id)!.derived_keys];
    const putsBefore = storage.stats.puts.length;
    db.beforeAdvance = () => {
      db.rows.clear();
      db.beforeAdvance = null;
    };

    const result = await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });

    expect(result).toEqual({ outcome: 'superseded', done: true });
    const written = storage.stats.puts.slice(putsBefore);
    expect(written.length).toBeGreaterThan(0);
    expect(storage.stats.deletes).toEqual(written);
    for (const key of written) {
      await expect(storage.memory.head(storage.bucket, key)).resolves.toBeNull();
    }
    for (const key of recorded) {
      await expect(storage.memory.head(storage.bucket, key)).resolves.not.toBeNull();
    }
  });

  it('lists every object it writes before writing it, so a step that dies leaves none unlisted', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const cursor = structuredClone(db.rowForAsset(id)!.cursor);

    db.failNextAdvance = true;
    await expect(
      prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY }),
    ).rejects.toThrow('connection reset');
    db.tick(CHAT_LARGE_FILE_POLICY.preparation.stallMs + 60_000);
    await failStalledPreparations(db, {
      stalledForMs: CHAT_LARGE_FILE_POLICY.preparation.stallMs,
      limit: 10,
    });

    const row = db.rowForAsset(id)!;
    expect(row).toMatchObject({ state: 'prepare_failed', error: 'stalled', cursor });
    const derivedPuts = storage.stats.puts.filter((key) => key.startsWith('chat-derived/'));
    expect(derivedPuts.length).toBeGreaterThan(0);
    for (const key of derivedPuts) expect(row.derived_keys).toContain(key);
  });

  it('writes nothing for a row erased after the step read it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    db.beforeListKeys = () => {
      db.rowForAsset(id)!.media_asset_id = null;
      db.beforeListKeys = null;
    };

    const result = await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });

    expect(result).toEqual({ outcome: 'superseded', done: true });
    expect(storage.stats.puts).toEqual([]);
    expect([...db.rows.values()][0]!.derived_keys).toEqual([]);
  });

  it('a step that lost to another run keeps the objects that run recorded', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const firstRun = structuredClone(db.rowForAsset(id)!);
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const advancedRow = structuredClone(db.rowForAsset(id)!);
    db.rows.set(firstRun.id, firstRun);
    db.beforeAdvance = () => {
      db.rows.set(advancedRow.id, advancedRow);
      db.beforeAdvance = null;
    };

    const result = await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });

    expect(result).toEqual({ outcome: 'superseded', done: true });
    expect(storage.stats.deletes).toEqual([]);
    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: 100 },
      { userId: USER, db, storage },
    );
    expect(text?.text).toMatch(/^The quarterly ledger/);
  });

  it('readers trust only segments up to segments_ready', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const row = db.rowForAsset(id)!;
    const ready = Number(row['segments_ready']);
    const prefix = preparationKeyPrefix(USER, id);
    await storage.memory.put({
      bucket: storage.bucket,
      key: textSegmentKey(prefix, ready + 1),
      body: Buffer.from('UNFINISHED-SEGMENT'),
      contentType: 'text/plain',
    });

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: 100_000_000 },
      { userId: USER, db, storage },
    );

    expect(card).toMatchObject({ state: 'preparing', segmentsReady: ready });
    expect(text?.text).not.toContain('UNFINISHED-SEGMENT');
    expect(text?.totalChars).toBe(card?.textChars);
    expect(text?.reachedEnd).toBe(true);
  });

  it('answers no preparation when there is no row', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = testUuid();

    await expect(readPreparedCard(id, { userId: USER, db, storage })).resolves.toBeNull();
    await expect(
      readPreparedText(id, { startChar: 0, maxChars: 10 }, { userId: USER, db, storage }),
    ).resolves.toBeNull();
    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toBeNull();
    await expect(savePreparedPageText(id, 1, 'text', { userId: USER, db, storage })).resolves.toBe(
      'no_preparation',
    );
  });

  it('answers no preparation without naming a new table when the schema is absent', async () => {
    vi.setSystemTime(Date.now() + SCHEMA_ANSWER_TTL_MS);
    const delegate = { query: vi.fn(async () => []) };
    const db = createSchemaAbsentDb(delegate);
    const storage = createCountingStorage();
    const id = testUuid();

    await expect(readPreparedCard(id, { userId: USER, db, storage })).resolves.toBeNull();
    await expect(
      readPreparedText(id, { startChar: 0, maxChars: 10 }, { userId: USER, db, storage }),
    ).resolves.toBeNull();
    await expect(readPreparedPage(id, 3, { userId: USER, db, storage })).resolves.toBeNull();
    await expect(sumIndexedCharsForUser(USER, { db })).resolves.toBe(0);
    await expect(prepareChatFileStep(id, { db, storage })).resolves.toEqual({
      outcome: 'not_prepared',
      reason: 'schema_absent',
      done: true,
    });
    expect(delegate.query).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + SCHEMA_ANSWER_TTL_MS);
  });

  it('leaves files within the inline limit unprepared', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = testUuid();
    db.addAsset({
      id,
      mime_type: 'text/plain',
      storage_pathname: `chat-attachments/${USER}/${id}.txt.sealed`,
      filename: 'small.txt',
      byte_size: MAX_CHAT_ATTACHMENT_BYTES,
    });

    await expect(prepareChatFileStep(id, { db, storage })).resolves.toEqual({
      outcome: 'not_prepared',
      reason: 'inline',
      done: true,
    });
    expect(db.rows.size).toBe(0);
    expect(storage.stats.heads).toBe(0);
  });

  it('keeps OCR transcriptions once each, within the per-file cap', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const pages = Array.from({ length: 6 }, () => '');
    const pdf = buildPdf({ pages, paddingBytes: MAX_CHAT_ATTACHMENT_BYTES + MIB });
    const id = testUuid();
    const key = `chat-attachments/${USER}/${id}.pdf.sealed`;
    await storeSource(storage, key, pdf, 'application/pdf');
    db.addAsset({
      id,
      mime_type: 'application/pdf',
      storage_pathname: key,
      filename: 'scan.pdf',
      byte_size: pdf.byteLength,
    });
    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: {
        ...CHAT_LARGE_FILE_POLICY.kinds,
        pdf: { ...CHAT_LARGE_FILE_POLICY.kinds.pdf, maxOcrPagesPerFile: 2 },
      },
    };

    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toEqual({
      status: 'no_text_layer',
      page: 1,
    });
    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('saved');
    await expect(
      savePreparedPageText(id, 1, 'Invoice again', { userId: USER, db, storage, policy }),
    ).resolves.toBe('already_saved');
    await expect(
      savePreparedPageText(id, 2, 'Receipt 9', { userId: USER, db, storage, policy }),
    ).resolves.toBe('saved');
    await expect(
      savePreparedPageText(id, 3, 'Over the cap', { userId: USER, db, storage, policy }),
    ).resolves.toBe('cap_reached');

    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toEqual({
      status: 'text',
      page: 1,
      source: 'ocr',
      text: 'Invoice 4471',
    });
    await expect(
      storage.memory.head(storage.bucket, ocrPageKey(preparationKeyPrefix(USER, id), 3)),
    ).resolves.toBeNull();
    await expect(
      savePreparedPageText(id, 7, 'No such page', { userId: USER, db, storage, policy }),
    ).resolves.toBe('no_preparation');
  });

  it('counts the scanned pages a file has kept, once each, up to its cap', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const pdf = buildPdf({
      pages: Array.from({ length: 6 }, () => ''),
      paddingBytes: MAX_CHAT_ATTACHMENT_BYTES + MIB,
    });
    const id = testUuid();
    const key = `chat-attachments/${USER}/${id}.pdf.sealed`;
    await storeSource(storage, key, pdf, 'application/pdf');
    db.addAsset({
      id,
      mime_type: 'application/pdf',
      storage_pathname: key,
      filename: 'scan.pdf',
      byte_size: pdf.byteLength,
    });
    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: {
        ...CHAT_LARGE_FILE_POLICY.kinds,
        pdf: { ...CHAT_LARGE_FILE_POLICY.kinds.pdf, maxOcrPagesPerFile: 2 },
      },
    };

    await expect(countSavedOcrPages(id, { userId: USER, db })).resolves.toBe(0);
    await savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy });
    await savePreparedPageText(id, 1, 'Invoice again', { userId: USER, db, storage, policy });
    await expect(countSavedOcrPages(id, { userId: USER, db })).resolves.toBe(1);
    await expect(isOcrPageListed(id, 1, { userId: USER, db })).resolves.toBe(true);
    await expect(isOcrPageListed(id, 2, { userId: USER, db })).resolves.toBe(false);
    await expect(isOcrPageListed(id, 1, { userId: 'someone-else', db })).resolves.toBeNull();
    await expect(isOcrPageListed(testUuid(), 1, { userId: USER, db })).resolves.toBeNull();
    await savePreparedPageText(id, 2, 'Receipt 9', { userId: USER, db, storage, policy });
    await expect(
      savePreparedPageText(id, 3, 'Over the cap', { userId: USER, db, storage, policy }),
    ).resolves.toBe('cap_reached');
    await expect(countSavedOcrPages(id, { userId: USER, db })).resolves.toBe(
      policy.kinds.pdf.maxOcrPagesPerFile,
    );
    await expect(countSavedOcrPages(testUuid(), { userId: USER, db })).resolves.toBeNull();
  });

  it('keeps every object a step writes under the preparation key prefix erasure deletes by', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const pdf = buildPdf({
      pages: ['Harbor fees', 'Vessel list', 'Totals'],
      outline: [
        { title: 'Fees', page: 1 },
        { title: 'Totals', page: 3 },
      ],
      paddingBytes: MAX_CHAT_ATTACHMENT_BYTES + MIB,
    });
    const id = testUuid();
    const key = `chat-attachments/${USER}/${id}.pdf.sealed`;
    await storeSource(storage, key, pdf, 'application/pdf');
    db.addAsset({
      id,
      mime_type: 'application/pdf',
      storage_pathname: key,
      filename: 'fees.pdf',
      byte_size: pdf.byteLength,
    });
    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
    await savePreparedPageText(id, 2, 'Transcribed', { userId: USER, db, storage });

    const prefix = preparationKeyPrefix(USER, id);
    const keys = db.rowForAsset(id)!.derived_keys;
    expect(keys.length).toBeGreaterThan(3);
    expect(keys.some((candidate) => candidate.includes('/ocr/'))).toBe(true);
    expect(keys.some((candidate) => candidate.endsWith('/outline.json'))).toBe(true);
    for (const candidate of keys) expect(candidate.startsWith(prefix)).toBe(true);
    const derivedPuts = storage.stats.puts.filter((candidate) =>
      candidate.startsWith('chat-derived/'),
    );
    for (const candidate of derivedPuts) expect(candidate.startsWith(prefix)).toBe(true);
  });

  it('addresses a preparation row only together with its owner', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const row = (await findPreparationById(db, { id: db.rowForAsset(id)!.id, userId: USER }))!;
    const stranger = { id: row.id, userId: 'someone_else' };
    const next: PreparationAdvance = {
      cursor: row.cursor,
      state: 'ready',
      segmentsReady: row.segmentsReady,
      pagesRead: row.pagesRead,
      pageCount: row.pageCount,
      sheetCount: row.sheetCount,
      coverage: row.coverage,
      error: null,
      addedKeys: [],
    };

    await expect(findPreparationById(db, stranger)).resolves.toBeNull();
    await expect(listPreparationKeys(db, stranger, row.cursor, [])).resolves.toBe(false);
    await expect(advancePreparation(db, stranger, row.cursor, next)).resolves.toBeNull();
    await expect(recordPreparedIndexedChars(db, id, 'someone_else', 5)).resolves.toBe(false);
    expect(db.rowForAsset(id)).toMatchObject({ state: 'preparing', indexed_chars: '0' });

    await expect(listPreparationKeys(db, row, row.cursor, [])).resolves.toBe(true);
    await expect(recordPreparedIndexedChars(db, id, USER, 5)).resolves.toBe(true);
    await expect(advancePreparation(db, row, row.cursor, next)).resolves.toMatchObject({
      state: 'ready',
    });
  });

  it('sums indexed characters over a person’s files that still exist', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const first = await sealedText(db, storage, largeText());
    const second = await sealedText(db, storage, largeText());
    await prepareChatFileStep(first, { db, storage, policy: SMALL_STEP_POLICY });
    await prepareChatFileStep(second, { db, storage, policy: SMALL_STEP_POLICY });

    await expect(recordPreparedIndexedChars(db, first, USER, 1_500_000)).resolves.toBe(true);
    await expect(recordPreparedIndexedChars(db, second, USER, 400_000)).resolves.toBe(true);
    await expect(sumIndexedCharsForUser(USER, { db })).resolves.toBe(1_900_000);

    db.rowForAsset(second)!.media_asset_id = null;
    await expect(sumIndexedCharsForUser(USER, { db })).resolves.toBe(1_500_000);
    await expect(sumIndexedCharsForUser('someone_else', { db })).resolves.toBe(0);
  });

  it('fails a preparation whose cursor has not moved within the stall window', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const stalled = await sealedText(db, storage, largeText());
    await prepareChatFileStep(stalled, { db, storage, policy: SMALL_STEP_POLICY });
    db.tick(CHAT_LARGE_FILE_POLICY.preparation.stallMs - 3_600_000);
    const live = await sealedText(db, storage, largeText());
    await prepareChatFileStep(live, { db, storage, policy: SMALL_STEP_POLICY });
    db.tick(3_600_001);

    const failed = await failStalledPreparations(db, {
      stalledForMs: CHAT_LARGE_FILE_POLICY.preparation.stallMs,
      limit: 100,
    });

    expect(failed).toEqual([db.rowForAsset(stalled)!.id]);
    expect(db.rowForAsset(stalled)).toMatchObject({ state: 'prepare_failed', error: 'stalled' });
    expect(db.rowForAsset(live)).toMatchObject({ state: 'preparing' });
  });

  it('deletes an orphaned row only with the key list its objects were deleted for', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    db.rowForAsset(id)!.media_asset_id = null;

    const [orphan] = await listOrphanedPreparations(db, { limit: 10 });
    expect(orphan?.derivedKeys.length).toBeGreaterThan(0);
    await expect(
      deleteOrphanedPreparation(db, { ...orphan!, derivedKeys: orphan!.derivedKeys.slice(1) }),
    ).resolves.toBe(false);
    await expect(
      deleteOrphanedPreparation(db, { ...orphan!, userId: 'someone_else' }),
    ).resolves.toBe(false);
    await expect(deleteOrphanedPreparation(db, orphan!)).resolves.toBe(true);
    expect(db.rows.size).toBe(0);
  });

  it('keeps an orphaned row whose step wrote and advanced after the eraser read it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedText(db, storage, largeText());
    await prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY });
    const row = db.rowForAsset(id)!;
    let orphan: OrphanedPreparation | undefined;
    const put = storage.store.put.bind(storage.store);
    storage.store.put = async (input) => {
      if (!orphan && input.key.startsWith('chat-derived/')) {
        row.media_asset_id = null;
        [orphan] = await listOrphanedPreparations(db, { limit: 10 });
        for (const key of orphan!.derivedKeys) await storage.memory.delete(storage.bucket, key);
        db.tick();
      }
      return put(input);
    };

    await expect(
      prepareChatFileStep(id, { db, storage, policy: SMALL_STEP_POLICY }),
    ).resolves.toMatchObject({
      outcome: 'advanced',
    });

    expect(orphan!.derivedKeys).toEqual(row.derived_keys);
    await expect(deleteOrphanedPreparation(db, orphan!)).resolves.toBe(false);
    expect(db.rows.has(row.id)).toBe(true);
    const [again] = await listOrphanedPreparations(db, { limit: 10 });
    await expect(deleteOrphanedPreparation(db, again!)).resolves.toBe(true);
  });

  it('lists an OCR transcription before writing it, so a save that dies leaves no unlisted object', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    db.beforePageTextListing = () => {
      db.beforePageTextListing = null;
      throw new Error('connection reset during listing');
    };

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).rejects.toThrow('connection reset during listing');

    const key = ocrPageKey(preparationKeyPrefix(USER, id), 1);
    await expect(storage.memory.head(storage.bucket, key)).resolves.toBeNull();
    expect(db.rowForAsset(id)!.derived_keys).not.toContain(key);
  });

  it('writes an OCR transcription whose earlier write failed on the next save of that page', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    storage.failNextPut = true;

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).rejects.toThrow('storage write failed');
    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toEqual({
      status: 'no_text_layer',
      page: 1,
    });

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('saved');
    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toMatchObject({
      source: 'ocr',
      text: 'Invoice 4471',
    });
  });

  it('writes a listed OCR transcription whose object is missing instead of calling it saved', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const key = ocrPageKey(preparationKeyPrefix(USER, id), 1);
    db.rowForAsset(id)!.derived_keys.push(key);

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('saved');

    await expect(readPreparedPage(id, 1, { userId: USER, db, storage })).resolves.toEqual({
      status: 'text',
      page: 1,
      source: 'ocr',
      text: 'Invoice 4471',
    });
    await expect(
      savePreparedPageText(id, 1, 'Invoice again', { userId: USER, db, storage, policy }),
    ).resolves.toBe('already_saved');
  });

  it('removes an OCR transcription written after the file was erased, so no object is left without a row', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const key = ocrPageKey(preparationKeyPrefix(USER, id), 1);
    const put = storage.store.put.bind(storage.store);
    storage.store.put = async (input) => {
      const result = await put(input);
      db.rows.clear();
      return result;
    };

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('no_preparation');

    await expect(storage.memory.head(storage.bucket, key)).resolves.toBeNull();
  });

  it('removes an OCR transcription whose key an eraser took off the row during the write', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const key = ocrPageKey(preparationKeyPrefix(USER, id), 1);
    const put = storage.store.put.bind(storage.store);
    storage.store.put = async (input) => {
      const result = await put(input);
      const row = db.rowForAsset(id)!;
      row.derived_keys = row.derived_keys.filter((listed) => listed !== key);
      return result;
    };

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('no_preparation');

    await expect(storage.memory.head(storage.bucket, key)).resolves.toBeNull();
  });

  it('keeps an OCR transcription whose row is still there after the write', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const key = ocrPageKey(preparationKeyPrefix(USER, id), 1);

    await expect(
      savePreparedPageText(id, 1, 'Invoice 4471', { userId: USER, db, storage, policy }),
    ).resolves.toBe('saved');

    await expect(storage.memory.head(storage.bucket, key)).resolves.not.toBeNull();
  });

  it('answers a reader that names another owner as it does a file with no preparation', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const stranger = { db, storage, policy, userId: 'someone_else' };
    const owner = { db, storage, policy, userId: USER };

    await expect(readPreparedCard(id, stranger)).resolves.toBeNull();
    await expect(
      readPreparedText(id, { startChar: 0, maxChars: 10 }, stranger),
    ).resolves.toBeNull();
    await expect(readPreparedPage(id, 1, stranger)).resolves.toBeNull();
    await expect(countSavedOcrPages(id, stranger)).resolves.toBeNull();
    await expect(savePreparedPageText(id, 1, 'Invoice 4471', stranger)).resolves.toBe(
      'no_preparation',
    );
    await expect(
      storage.memory.head(storage.bucket, ocrPageKey(preparationKeyPrefix(USER, id), 1)),
    ).resolves.toBeNull();

    await expect(savePreparedPageText(id, 1, 'Invoice 4471', owner)).resolves.toBe('saved');
    await expect(countSavedOcrPages(id, owner)).resolves.toBe(1);
    await expect(readPreparedCard(id, owner)).resolves.toMatchObject({ assetId: id });
    expect(db.statements.some((statement) => statement.includes('and user_id = $2'))).toBe(true);
  });

  it('answers a reader that names no owner as it does a file with no preparation', async () => {
    const { db, storage, id, policy } = await scannedPdf();
    const ownerless = { db, storage, policy } as unknown as PreparedReaderDeps;

    await expect(readPreparedCard(id, ownerless)).resolves.toBeNull();
    await expect(
      readPreparedText(id, { startChar: 0, maxChars: 10 }, ownerless),
    ).resolves.toBeNull();
    await expect(readPreparedPage(id, 1, ownerless)).resolves.toBeNull();
    await expect(countSavedOcrPages(id, ownerless)).resolves.toBeNull();
    await expect(savePreparedPageText(id, 1, 'Invoice 4471', ownerless)).resolves.toBe(
      'no_preparation',
    );
  });
});

async function scannedPdf() {
  const db = new FakePreparationDb();
  const storage = createCountingStorage();
  const pdf = buildPdf({ pages: ['', ''], paddingBytes: MAX_CHAT_ATTACHMENT_BYTES + MIB });
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.pdf.sealed`;
  await storeSource(storage, key, pdf, 'application/pdf');
  db.addAsset({
    id,
    mime_type: 'application/pdf',
    storage_pathname: key,
    filename: 'scan.pdf',
    byte_size: pdf.byteLength,
  });
  await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
  const policy = {
    ...CHAT_LARGE_FILE_POLICY,
    kinds: {
      ...CHAT_LARGE_FILE_POLICY.kinds,
      pdf: { ...CHAT_LARGE_FILE_POLICY.kinds.pdf, maxOcrPagesPerFile: 2 },
    },
  };
  return { db, storage, id, policy };
}
