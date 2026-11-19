import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type SchemaModule = typeof import('@/lib/server/chat-file-intake/schema');
type ScannedDocumentTextModule = typeof import('@/lib/server/scanned-document-text');

const mocks = vi.hoisted(() => ({ transcribe: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/chat-file-intake/schema', async (importOriginal) => {
  const actual = await importOriginal<SchemaModule>();
  return {
    ...actual,
    chatFileSchemaReady: (db: Parameters<typeof actual.chatFileSchemaReady>[0]) =>
      actual.chatFileSchemaReady(db),
  };
});
vi.mock('@/lib/server/scanned-document-text', async (importOriginal) => {
  class ScannedTextWithheldError extends Error {}
  return {
    ...(await importOriginal<ScannedDocumentTextModule>()),
    SCANNED_PAGES_OCR_NOTE: '[Read from the scan by a model.]',
    ScannedTextWithheldError,
    transcribeScannedPages: mocks.transcribe,
  };
});

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import {
  BUCKET,
  FakePreparationDb,
  createCountingStorage,
  type CountingStorage,
} from '@/lib/server/chat-file-preparation/__tests__/preparation-harness';
import {
  ocrPageKey,
  pagesIndexKey,
  preparationKeyPrefix,
  serializePagesIndex,
  textSegmentKey,
} from '@/lib/server/chat-file-preparation/derived-keys';
import { readPreparedPage } from '@/lib/server/chat-file-preparation/readers';
import {
  SCANNED_PAGE_FILE_CAP_MESSAGE,
  SCANNED_PAGE_SANDBOX_ONLY_MESSAGE,
  SCANNED_PAGE_TURN_CAP_MESSAGE,
  SCANNED_PAGE_UNREADABLE_MESSAGE,
  readScannedPages,
  type ScannedPageOcr,
} from '../scanned-page-reader';

const OWNER = 'user-1';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const PDF_POLICY = CHAT_LARGE_FILE_POLICY.kinds.pdf;
const PREFIX = preparationKeyPrefix(OWNER, ASSET_ID, 1);

async function scannedPdf(
  options: { textPages?: readonly number[]; pageCount?: number; ocrKeys?: number } = {},
): Promise<{ db: FakePreparationDb; storage: CountingStorage }> {
  const db = new FakePreparationDb();
  const storage = createCountingStorage();
  const pageCount = options.pageCount ?? 20;
  const textPages = new Set(options.textPages ?? []);
  let text = '';
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const start = text.length;
    if (textPages.has(page)) text += `Page ${page} words.`;
    return { page, start, end: text.length, hasText: textPages.has(page) };
  });
  const segmentKey = textSegmentKey(PREFIX, 1);
  const indexKey = pagesIndexKey(PREFIX, 1);
  await storage.memory.put({
    bucket: BUCKET,
    key: segmentKey,
    body: Buffer.from(text),
    contentType: 'text/plain',
  });
  await storage.memory.put({
    bucket: BUCKET,
    key: indexKey,
    body: Buffer.from(serializePagesIndex(pages)),
    contentType: 'application/json',
  });
  const ocrKeys = Array.from({ length: options.ocrKeys ?? 0 }, (_, index) =>
    ocrPageKey(PREFIX, pageCount + 100 + index),
  );
  db.rows.set('row-1', {
    id: 'row-1',
    media_asset_id: ASSET_ID,
    user_id: OWNER,
    organization_id: null,
    kind: 'pdf',
    state: 'ready',
    preparer_version: 1,
    cursor: {},
    segments_ready: 1,
    pages_read: pageCount,
    page_count: pageCount,
    sheet_count: null,
    indexed_chars: '0',
    derived_keys: [segmentKey, indexKey, ...ocrKeys],
    coverage: { segmentChars: [text.length], textChars: text.length },
    error: null,
    updated_at: new Date(),
  });
  return { db, storage };
}

function ocr(overrides: Partial<ScannedPageOcr> = {}): ScannedPageOcr & {
  renderPages: ReturnType<typeof vi.fn>;
} {
  return {
    db: {} as DatabaseAdapter,
    userId: OWNER,
    organizationId: null,
    planTier: 'pro',
    renderPages: vi.fn(
      async ({ pages }: { pages: readonly number[] }) =>
        new Map(
          pages.map((page) => [page, { mimeType: 'image/png' as const, base64: `page-${page}` }]),
        ),
    ),
    turn: { pagesTranscribed: 0 },
    ...overrides,
  } as ScannedPageOcr & { renderPages: ReturnType<typeof vi.fn> };
}

function read(
  env: { db: FakePreparationDb; storage: CountingStorage },
  page: number,
  context: ScannedPageOcr | null,
  policy = CHAT_LARGE_FILE_POLICY,
) {
  return readScannedPages({
    assetId: ASSET_ID,
    source: { storagePathname: `uploads/${ASSET_ID}`, byteSize: 300 * 1024 * 1024 },
    page,
    ocr: context,
    deps: { db: env.db, userId: OWNER, storage: env.storage, policy },
  });
}

beforeEach(() => {
  mocks.transcribe.mockReset();
  mocks.transcribe.mockImplementation(
    async ({ pageImages }: { pageImages: { base64: string }[] }) =>
      `Text of ${pageImages[0]!.base64}`,
  );
});

describe('readScannedPages', () => {
  it('transcribes one batch of scanned pages, one page per call, and saves each page', async () => {
    const env = await scannedPdf();
    const context = ocr();

    const reading = await read(env, 1, context);

    expect(reading).toMatchObject({ status: 'read' });
    if (reading.status !== 'read') return;
    expect(reading.pages.map((entry) => entry.page)).toEqual([1, 2, 3, 4]);
    expect(PDF_POLICY.ocrBatchPages).toBe(4);
    expect(mocks.transcribe).toHaveBeenCalledTimes(PDF_POLICY.ocrBatchPages);
    for (const [input] of mocks.transcribe.mock.calls) {
      expect(input.pageImages).toHaveLength(1);
      expect(input.documentId).toMatch(/^[0-9a-f-]{36}:p\d+:[0-9a-f]{32}$/);
    }
    expect(context.turn.pagesTranscribed).toBe(4);
    const saved = await readPreparedPage(ASSET_ID, 3, {
      db: env.db,
      userId: OWNER,
      storage: env.storage,
    });
    expect(saved).toEqual({ status: 'text', page: 3, source: 'ocr', text: 'Text of page-3' });
  });

  it('stops the batch at the next page that has a text layer', async () => {
    const env = await scannedPdf({ textPages: [3] });

    const reading = await read(env, 1, ocr());

    expect(reading.status === 'read' && reading.pages.map((entry) => entry.page)).toEqual([1, 2]);
  });

  it('stops at the per-turn cap', async () => {
    const env = await scannedPdf();
    const context = ocr({ turn: { pagesTranscribed: PDF_POLICY.ocrPagesPerTurn - 2 } });

    const reading = await read(env, 5, context);
    expect(reading.status === 'read' && reading.pages.map((entry) => entry.page)).toEqual([5, 6]);
    expect(context.turn.pagesTranscribed).toBe(PDF_POLICY.ocrPagesPerTurn);

    mocks.transcribe.mockClear();
    expect(await read(env, 9, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_TURN_CAP_MESSAGE,
    });
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(context.renderPages).toHaveBeenCalledTimes(1);
  });

  it('two calls in one turn never pass the per-turn cap together', async () => {
    const env = await scannedPdf();
    const context = ocr({ turn: { pagesTranscribed: PDF_POLICY.ocrPagesPerTurn - 4 } });

    await Promise.all([read(env, 1, context), read(env, 11, context)]);

    expect(context.turn.pagesTranscribed).toBe(PDF_POLICY.ocrPagesPerTurn);
    expect(mocks.transcribe).toHaveBeenCalledTimes(4);
  });

  it('answers a file at its per-file cap before any render or transcription, and spends nothing more that turn', async () => {
    const atCap = await scannedPdf({ ocrKeys: PDF_POLICY.maxOcrPagesPerFile });
    const context = ocr();

    expect(await read(atCap, 1, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_FILE_CAP_MESSAGE,
    });

    expect(context.renderPages).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(context.turn.pagesTranscribed).toBe(0);
    expect(context.turn.filesAtOcrCap?.has(ASSET_ID)).toBe(true);
    const statementsAfterFirst = atCap.db.statements.length;
    expect(await read(atCap, 5, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_FILE_CAP_MESSAGE,
    });
    expect(atCap.db.statements.length).toBe(statementsAfterFirst);
    expect(
      atCap.db.rowForAsset(ASSET_ID)!.derived_keys.filter((key) => key.includes('/ocr/')),
    ).toHaveLength(PDF_POLICY.maxOcrPagesPerFile);
  });

  it('reads the one page a file has left under its per-file cap and saves it', async () => {
    const oneLeft = await scannedPdf({ ocrKeys: PDF_POLICY.maxOcrPagesPerFile - 1 });
    const context = ocr();

    const reading = await read(oneLeft, 1, context);

    expect(reading.status === 'read' && reading.pages.map((entry) => entry.page)).toEqual([1]);
    expect(context.renderPages).toHaveBeenCalledWith(expect.objectContaining({ pages: [1] }));
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
    expect(context.turn.pagesTranscribed).toBe(1);
    const row = oneLeft.db.rowForAsset(ASSET_ID)!;
    expect(row.derived_keys.filter((key) => key.includes('/ocr/'))).toHaveLength(
      PDF_POLICY.maxOcrPagesPerFile,
    );
    expect(row.derived_keys).toContain(ocrPageKey(PREFIX, 1));
    expect(await read(oneLeft, 5, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_FILE_CAP_MESSAGE,
    });
  });

  it('cuts a batch that would cross the per-file cap to the pages the file has left', async () => {
    const twoLeft = await scannedPdf({ ocrKeys: PDF_POLICY.maxOcrPagesPerFile - 2 });
    const context = ocr();

    const reading = await read(twoLeft, 1, context);

    expect(PDF_POLICY.ocrBatchPages).toBeGreaterThan(2);
    expect(reading.status === 'read' && reading.pages.map((entry) => entry.page)).toEqual([1, 2]);
    expect(context.renderPages).toHaveBeenCalledWith(expect.objectContaining({ pages: [1, 2] }));
    expect(mocks.transcribe).toHaveBeenCalledTimes(2);
    expect(context.turn.pagesTranscribed).toBe(2);
    expect(
      twoLeft.db.rowForAsset(ASSET_ID)!.derived_keys.filter((key) => key.includes('/ocr/')),
    ).toHaveLength(PDF_POLICY.maxOcrPagesPerFile);
  });

  it('rewrites the one page at the per-file cap whose key was listed by a save that died before its write', async () => {
    const atCap = await scannedPdf({ ocrKeys: PDF_POLICY.maxOcrPagesPerFile });
    const row = atCap.db.rowForAsset(ASSET_ID)!;
    const pageKey = ocrPageKey(PREFIX, 1);
    row.derived_keys = [...row.derived_keys.slice(0, -1), pageKey];
    const context = ocr();

    const reading = await read(atCap, 1, context);

    expect(reading.status === 'read' && reading.pages.map((entry) => entry.page)).toEqual([1]);
    expect(context.renderPages).toHaveBeenCalledWith(expect.objectContaining({ pages: [1] }));
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
    expect(await atCap.storage.memory.head(BUCKET, pageKey)).toBeTruthy();
    expect(row.derived_keys.filter((key) => key.includes('/ocr/'))).toHaveLength(
      PDF_POLICY.maxOcrPagesPerFile,
    );
    expect(await read(atCap, 5, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_FILE_CAP_MESSAGE,
    });
  });

  it('spends nothing when the file has no preparation row to keep a page in', async () => {
    const env = await scannedPdf();
    env.db.rows.clear();
    const context = ocr();

    expect(await read(env, 1, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_UNREADABLE_MESSAGE,
    });
    expect(context.renderPages).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it('never reads or saves a page of a file another person owns', async () => {
    const env = await scannedPdf();
    const context = ocr();

    const reading = await readScannedPages({
      assetId: ASSET_ID,
      source: { storagePathname: `uploads/${ASSET_ID}`, byteSize: 300 * 1024 * 1024 },
      page: 1,
      ocr: context,
      deps: { db: env.db, userId: 'someone-else', storage: env.storage },
    });

    expect(reading.status).toBe('unavailable');
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(env.db.rowForAsset(ASSET_ID)!.derived_keys.some((key) => key.includes('/ocr/'))).toBe(
      false,
    );
  });

  it('stops spending once the page asked for cannot be transcribed', async () => {
    mocks.transcribe.mockResolvedValue(null);
    const context = ocr();

    expect(await read(await scannedPdf(), 1, context)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_UNREADABLE_MESSAGE,
    });
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
    expect(context.turn.pagesTranscribed).toBe(1);
  });

  it('returns the pages it paid for when saving a transcription fails', async () => {
    const env = await scannedPdf();
    env.storage.failNextPut = true;

    const reading = await read(env, 1, ocr());

    expect(reading.status === 'read' && reading.pages[0]).toEqual({
      page: 1,
      text: 'Text of page-1',
    });
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });

  it('answers that the page could not be read when the OCR route refuses or nothing renders', async () => {
    mocks.transcribe.mockRejectedValue(new Error('no route'));
    expect(await read(await scannedPdf(), 1, ocr())).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_UNREADABLE_MESSAGE,
    });

    mocks.transcribe.mockClear();
    const failing = ocr({
      renderPages: vi.fn(async () => Promise.reject(new Error('range read failed'))),
    });
    expect(await read(await scannedPdf(), 1, failing)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_UNREADABLE_MESSAGE,
    });
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(failing.renderPages).toHaveBeenCalledTimes(1);
    expect(failing.turn.pagesTranscribed).toBe(0);
  });

  it('spends nothing outside an entitled context or with range loading off', async () => {
    expect(await read(await scannedPdf(), 1, null)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_UNREADABLE_MESSAGE,
    });
    const context = ocr();
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: { ...CHAT_LARGE_FILE_POLICY.kinds, pdf: { ...PDF_POLICY, rangeLoading: false } },
    };
    expect(await read(await scannedPdf(), 1, context, policy)).toEqual({
      status: 'unavailable',
      message: SCANNED_PAGE_SANDBOX_ONLY_MESSAGE,
    });
    expect(context.renderPages).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(context.turn.pagesTranscribed).toBe(0);
  });

  it('keeps a transcription Postgres can store', async () => {
    mocks.transcribe.mockResolvedValue('Total\u0000 due');
    const env = await scannedPdf();

    const reading = await read(env, 1, ocr());

    expect(reading.status === 'read' && reading.pages[0]?.text).toBe('Total due');
  });
});
