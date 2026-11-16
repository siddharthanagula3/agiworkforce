// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type PdfAttachmentContentModule = typeof import('@/lib/server/pdf-attachment-content');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/pdf-attachment-content', async (importOriginal) => {
  const actual = await importOriginal<PdfAttachmentContentModule>();
  return { ...actual, loadPdfjs: vi.fn(actual.loadPdfjs) };
});

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { loadPdfjs } from '@/lib/server/pdf-attachment-content';
import { prepareChatFileStep, readPreparedCard, readPreparedPage, readPreparedText } from '..';
import { MAX_OUTLINE_TITLE_CHARS } from '../derived-keys';
import { MAX_OUTLINE_NODES } from '../pdf';
import { createPdfRangeSource, PDF_RANGE_CHUNK_BYTES } from '../pdf-range-source';
import {
  buildPdf,
  createCountingStorage,
  FakePreparationDb,
  prepareUntilDone,
  seededRandom,
  seededWords,
  storeSource,
  testUuid,
  USER,
  type CountingStorage,
} from './preparation-harness';

const MIB = 1024 * 1024;
const LARGE_PADDING = MAX_CHAT_ATTACHMENT_BYTES + MIB;

function withPdfPolicy(overrides: Partial<(typeof CHAT_LARGE_FILE_POLICY)['kinds']['pdf']>) {
  return {
    ...CHAT_LARGE_FILE_POLICY,
    kinds: {
      ...CHAT_LARGE_FILE_POLICY.kinds,
      pdf: { ...CHAT_LARGE_FILE_POLICY.kinds.pdf, ...overrides },
    },
  };
}

async function sealedPdf(
  db: FakePreparationDb,
  storage: CountingStorage,
  data: Buffer,
  byteSize: number = data.byteLength,
) {
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.pdf.sealed`;
  await storeSource(storage, key, data, 'application/pdf');
  db.addAsset({
    id,
    mime_type: 'application/pdf',
    storage_pathname: key,
    filename: 'report.pdf',
    byte_size: byteSize,
  });
  return id;
}

function pageTexts(count: number, seed: number): string[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => `Page${index + 1} ${seededWords(random, 6)}`);
}

describe('PDF preparation', () => {
  it('reads by range the same text the buffered path reads, while fetching fewer bytes', async () => {
    const pdf = buildPdf({ pages: pageTexts(12, 7), paddingBytes: LARGE_PADDING });
    const rangedDb = new FakePreparationDb();
    const rangedStorage = createCountingStorage();
    const rangedId = await sealedPdf(rangedDb, rangedStorage, pdf);
    await prepareUntilDone(() =>
      prepareChatFileStep(rangedId, { db: rangedDb, storage: rangedStorage }),
    );

    const bufferedDb = new FakePreparationDb();
    const bufferedStorage = createCountingStorage();
    const bufferedId = await sealedPdf(bufferedDb, bufferedStorage, pdf);
    await prepareUntilDone(() =>
      prepareChatFileStep(bufferedId, {
        db: bufferedDb,
        storage: bufferedStorage,
        policy: withPdfPolicy({ rangeLoading: false }),
      }),
    );

    const ranged = await readPreparedText(
      rangedId,
      { startChar: 0, maxChars: 1_000_000 },
      { userId: USER, db: rangedDb, storage: rangedStorage },
    );
    const buffered = await readPreparedText(
      bufferedId,
      { startChar: 0, maxChars: 1_000_000 },
      { userId: USER, db: bufferedDb, storage: bufferedStorage },
    );
    expect(ranged?.text).toContain('[Page 12]\nPage12 ');
    expect(ranged?.text).toBe(buffered?.text);
    expect(rangedStorage.stats.ranges.every((range) => range.startsWith('bytes='))).toBe(true);
    expect(bufferedStorage.stats.bytesRead).toBe(pdf.byteLength);
    expect(rangedStorage.stats.bytesRead).toBeLessThan(pdf.byteLength / 4);
  });

  it('reads 1,000 of 1,200 pages in steps of 100 and reports the rest as unread', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedPdf(
      db,
      storage,
      buildPdf({ pages: pageTexts(1_200, 11), paddingBytes: LARGE_PADDING }),
    );

    const steps = await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(steps).toBe(10);
    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ state: 'ready_partial', pagesRead: 1_000, pageCount: 1_200 });
    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000_000 },
      { userId: USER, db, storage },
    );
    expect(text?.text).toContain('[Page 1000]\nPage1000 ');
    expect(text?.text).not.toContain('[Page 1001]');
    expect(text?.pageAnchors).toHaveLength(1_000);
    await expect(readPreparedPage(id, 1_000, { userId: USER, db, storage })).resolves.toMatchObject(
      {
        status: 'text',
        source: 'text_layer',
        text: expect.stringContaining('Page1000 '),
      },
    );
    await expect(readPreparedPage(id, 1_001, { userId: USER, db, storage })).resolves.toEqual({
      status: 'not_read',
      page: 1_001,
    });
    await expect(readPreparedPage(id, 1_201, { userId: USER, db, storage })).resolves.toEqual({
      status: 'out_of_range',
      page: 1_201,
    });
  });

  it('gives prepare_failed for a malformed PDF and keeps the file otherwise untouched', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const malformed = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(LARGE_PADDING, 0x20),
      Buffer.from('trailer garbage %%EOF'),
    ]);
    const id = await sealedPdf(db, storage, malformed);

    const result = await prepareChatFileStep(id, { db, storage });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({
      state: 'prepare_failed',
      error: 'unreadable',
      derived_keys: [],
    });
    await expect(
      readPreparedText(id, { startChar: 0, maxChars: 100 }, { userId: USER, db, storage }),
    ).resolves.toMatchObject({ text: '', totalChars: 0 });
  });

  it('retries a step whose pdf.js module failed to load instead of calling the file unreadable', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedPdf(
      db,
      storage,
      buildPdf({ pages: pageTexts(3, 13), paddingBytes: LARGE_PADDING }),
    );
    vi.mocked(loadPdfjs).mockRejectedValueOnce(new Error('Cannot find module pdf.worker.mjs'));

    await expect(prepareChatFileStep(id, { db, storage })).rejects.toThrow(
      'Cannot find module pdf.worker.mjs',
    );
    expect(db.rowForAsset(id)).toMatchObject({ state: 'preparing', error: null, derived_keys: [] });

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready', pages_read: 3 });
  });

  it('with range loading off refuses a 300 MiB PDF without reading it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedPdf(db, storage, buildPdf({ pages: ['tiny'] }), 300 * MIB);

    const result = await prepareChatFileStep(id, {
      db,
      storage,
      policy: withPdfPolicy({ rangeLoading: false }),
    });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({ error: 'too_large_for_buffered_read' });
    expect(storage.stats).toMatchObject({ reads: 0, heads: 0, bytesRead: 0 });
  });

  it('with range loading off reads a PDF under the buffered ceiling whole', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const pdf = buildPdf({ pages: pageTexts(3, 5), paddingBytes: LARGE_PADDING });
    const id = await sealedPdf(db, storage, pdf);
    const policy = withPdfPolicy({ rangeLoading: false, bufferedMaxBytes: pdf.byteLength + 1 });

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));

    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready', pages_read: 3 });
    expect(storage.stats.ranges).toEqual(['whole']);
    expect(storage.stats.bytesRead).toBe(pdf.byteLength);
  });

  it('marks pages without a text layer and keeps the outline', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealedPdf(
      db,
      storage,
      buildPdf({
        pages: ['Opening summary text', '', 'Closing remarks text'],
        paddingBytes: LARGE_PADDING,
        outline: [
          { title: 'Summary', page: 1 },
          { title: 'Remarks', page: 3 },
        ],
      }),
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card?.outline).toEqual([
      { title: 'Summary', level: 0, page: 1 },
      { title: 'Remarks', level: 0, page: 3 },
    ]);
    expect(card?.coverage['pagesWithoutText']).toBe(1);
    await expect(readPreparedPage(id, 2, { userId: USER, db, storage })).resolves.toEqual({
      status: 'no_text_layer',
      page: 2,
    });
  });

  it('caps an outline title and the outline nodes it visits', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const untitled = Array.from({ length: MAX_OUTLINE_NODES }, () => ({ title: ' ', page: 2 }));
    const id = await sealedPdf(
      db,
      storage,
      buildPdf({
        pages: ['Opening summary text', 'Closing remarks text'],
        paddingBytes: LARGE_PADDING,
        outline: [
          { title: 'T'.repeat(20_000), page: 1 },
          ...untitled,
          { title: 'Past the bound', page: 2 },
        ],
      }),
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card?.outline).toEqual([
      { title: 'T'.repeat(MAX_OUTLINE_TITLE_CHARS), level: 0, page: 1 },
    ]);
  });

  it('reports a page whose text the cap cut away entirely as not read', async () => {
    const pdf = buildPdf({ pages: pageTexts(3, 19), paddingBytes: LARGE_PADDING });
    const uncappedDb = new FakePreparationDb();
    const uncappedStorage = createCountingStorage();
    const uncappedId = await sealedPdf(uncappedDb, uncappedStorage, pdf);
    await prepareUntilDone(() =>
      prepareChatFileStep(uncappedId, { db: uncappedDb, storage: uncappedStorage }),
    );
    const whole = await readPreparedText(
      uncappedId,
      { startChar: 0, maxChars: 1_000_000 },
      { userId: USER, db: uncappedDb, storage: uncappedStorage },
    );
    const thirdStart = whole!.pageAnchors.find((anchor) => anchor.page === 3)!.char;

    for (const cap of [thirdStart, thirdStart + 4]) {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const id = await sealedPdf(db, storage, pdf);
      const policy = {
        ...CHAT_LARGE_FILE_POLICY,
        preparation: { ...CHAT_LARGE_FILE_POLICY.preparation, maxTextChars: cap },
      };

      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));

      const card = await readPreparedCard(id, { userId: USER, db, storage, policy });
      expect(card).toMatchObject({ state: 'ready_partial', pagesRead: 2, pageCount: 3 });
      await expect(readPreparedPage(id, 3, { userId: USER, db, storage, policy })).resolves.toEqual(
        { status: 'not_read', page: 3 },
      );
      await expect(
        readPreparedPage(id, 2, { userId: USER, db, storage, policy }),
      ).resolves.toMatchObject({ status: 'text', text: expect.stringContaining('Page2 ') });
      const text = await readPreparedText(
        id,
        { startChar: 0, maxChars: 1_000_000 },
        { userId: USER, db, storage, policy },
      );
      expect(text?.text).not.toMatch(/\[Pag$/);
      expect(text?.text).toBe(whole!.text.slice(0, thirdStart));
    }
  });

  it('drops a range that arrives after the document was destroyed', async () => {
    // pdf.js's own loader also rejects with "Worker was terminated" when a document is destroyed mid-load; only the transport's rejection is under test.
    const storage = createCountingStorage();
    const pdf = buildPdf({ pages: pageTexts(2, 23), paddingBytes: LARGE_PADDING });
    const key = `chat-attachments/${USER}/${testUuid()}.pdf.sealed`;
    await storeSource(storage, key, pdf, 'application/pdf');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getStream = storage.store.getStream.bind(storage.store);
    storage.store.getStream = async (...args) => {
      await held;
      return getStream(...args);
    };
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      const source = await createPdfRangeSource(storage, key, pdf.byteLength);
      const { getDocument } = await loadPdfjs();
      const task = getDocument({
        range: source.transport,
        rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
        disableAutoFetch: true,
        disableStream: true,
        useWorkerFetch: false,
        verbosity: 0,
      });
      task.promise.catch(() => undefined);
      await vi.waitFor(() => expect(source.requests).toBeGreaterThan(0));

      await task.destroy();
      release();
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off('unhandledRejection', onRejection);
    }

    const fromTransport = rejections.filter(
      (reason) => !(reason instanceof Error && reason.message === 'Worker was terminated'),
    );
    expect(fromTransport).toEqual([]);
  });
});
