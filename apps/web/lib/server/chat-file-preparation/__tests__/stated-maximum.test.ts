// @vitest-environment node
import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { prepareChatFileStep, readPreparedCard } from '..';
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
} from './preparation-harness';

/**
 * Each case holds a file of its kind's full stated size in memory, so the
 * file runs only when asked for and on its own, through the heavy-job lock:
 * CHAT_FILE_PREPARATION_MAX_SIZE_CHECK=1 scripts/dev/heavy-job.sh pnpm --dir apps/web exec vitest run lib/server/chat-file-preparation/__tests__/stated-maximum.test.ts
 */
const MAX_SIZE_CHECK_ENABLED = process.env['CHAT_FILE_PREPARATION_MAX_SIZE_CHECK'] === '1';
const CASE_TIMEOUT_MS = 30 * 60 * 1000;
const kinds = CHAT_LARGE_FILE_POLICY.kinds;

function seededLines(seed: number, count: number): Buffer {
  const random = seededRandom(seed);
  return Buffer.from(
    Array.from({ length: count }, () => `${seededWords(random, 9)}\n`).join(''),
    'utf8',
  );
}

function filled(size: number, head: Buffer, pattern: Buffer, tail = Buffer.alloc(0)): Buffer {
  const data = Buffer.alloc(size);
  head.copy(data, 0);
  data.fill(pattern, head.length, size - tail.length);
  tail.copy(data, size - tail.length);
  return data;
}

function pdfOfSize(size: number): Buffer {
  const random = seededRandom(41);
  const pages = Array.from(
    { length: 1_200 },
    (_, index) => `Page${index + 1} ${seededWords(random, 12)}`,
  );
  let padding = size - buildPdf({ pages }).byteLength - 64;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pdf = buildPdf({ pages, paddingBytes: padding });
    if (pdf.byteLength === size) return pdf;
    padding += size - pdf.byteLength;
  }
  throw new Error('The PDF fixture could not be sized exactly.');
}

type ArchiveMembers = readonly (readonly [name: string, body: string | Buffer])[];

/** The members are built once, so the probe and the sized archive compress them to the same bytes. */
async function zipOfSize(size: number, members: ArchiveMembers, padPath: string): Promise<Buffer> {
  const fixedDate = new Date(Date.UTC(2026, 10, 15));
  const sized = (padBytes: number) => {
    const zip = new JSZip();
    for (const [name, body] of members) zip.file(name, body, { date: fixedDate });
    zip.file(padPath, Buffer.alloc(padBytes, 0x5a), { compression: 'STORE', date: fixedDate });
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  };
  const probe = await sized(0);
  const archive = await sized(size - probe.byteLength);
  if (archive.byteLength !== size)
    throw new Error('The archive fixture could not be sized exactly.');
  return archive;
}

async function docxMembers(): Promise<ArchiveMembers> {
  const random = seededRandom(43);
  const document = new Document({
    sections: [
      {
        children: Array.from(
          { length: 2_000 },
          () => new Paragraph({ text: seededWords(random, 20) }),
        ),
      },
    ],
  });
  const source = await JSZip.loadAsync(await Packer.toBuffer(document));
  const members: [string, Buffer][] = [];
  for (const entry of Object.values(source.files)) {
    if (!entry.dir) members.push([entry.name, await entry.async('nodebuffer')]);
  }
  return members;
}

function workbookMembers(): ArchiveMembers {
  const random = seededRandom(47);
  const rows = Array.from(
    { length: 20_000 },
    (_, index) =>
      `<row r="${index + 1}"><c r="A${index + 1}"><v>${index}</v></c><c r="B${index + 1}"><v>${(random() * 1000).toFixed(2)}</v></c></row>`,
  );
  return [
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Ledger" sheetId="1"/></sheets></workbook>'],
    ['xl/worksheets/sheet1.xml', `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`],
  ];
}

function notebookOfSize(size: number): Buffer {
  const head = Buffer.from(
    '{"cells":[{"cell_type":"markdown","source":["# Model"]},{"cell_type":"code","source":"plot()","outputs":[{"output_type":"display_data","data":{"image/png":"',
    'utf8',
  );
  const tail = Buffer.from('"}}]}],"nbformat":4}', 'utf8');
  return filled(size, head, Buffer.from('QUJD', 'utf8'), tail);
}

async function prepareAtSize(data: Buffer, filename: string, mimeType: string) {
  const db = new FakePreparationDb();
  const storage = createCountingStorage();
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.sealed`;
  await storeSource(storage, key, data, mimeType);
  db.addAsset({
    id,
    mime_type: mimeType,
    storage_pathname: key,
    filename,
    byte_size: data.byteLength,
  });
  await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }), 200);
  return { card: await readPreparedCard(id, { userId: USER, db, storage }), stats: storage.stats };
}

describe.runIf(MAX_SIZE_CHECK_ENABLED)("preparation at each kind's stated maximum", () => {
  it('PDF', { timeout: CASE_TIMEOUT_MS }, async () => {
    const { card, stats } = await prepareAtSize(
      pdfOfSize(kinds.pdf.maxBytes),
      'report.pdf',
      'application/pdf',
    );
    expect(card).toMatchObject({
      state: 'ready_partial',
      pagesRead: kinds.pdf.maxTextPages,
      pageCount: 1_200,
    });
    expect(stats.bytesRead).toBeLessThan(kinds.pdf.maxBytes);
  });

  it('Office document', { timeout: CASE_TIMEOUT_MS }, async () => {
    const data = await zipOfSize(kinds.office.maxBytes, await docxMembers(), 'word/media/scan.bin');
    const { card } = await prepareAtSize(
      data,
      'brief.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(card).toMatchObject({ kind: 'office', state: 'ready' });
  });

  it('spreadsheet', { timeout: CASE_TIMEOUT_MS }, async () => {
    const data = await zipOfSize(
      kinds.spreadsheet.maxBytes,
      workbookMembers(),
      'xl/media/cache.bin',
    );
    const { card } = await prepareAtSize(
      data,
      'ledger.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(card).toMatchObject({ kind: 'spreadsheet', state: 'ready', sheetCount: 1 });
  });

  it('delimited table', { timeout: CASE_TIMEOUT_MS }, async () => {
    const random = seededRandom(53);
    const block = Buffer.from(
      Array.from(
        { length: 500 },
        (_, index) => `${index},${(random() * 1000).toFixed(2)},${seededWords(random, 4)}\n`,
      ).join(''),
      'utf8',
    );
    const data = filled(kinds.delimited.maxBytes, Buffer.from('id,amount,notes\n', 'utf8'), block);
    const { card } = await prepareAtSize(data, 'ledger.csv', 'text/csv');
    expect(card).toMatchObject({ kind: 'delimited', state: 'ready' });
  });

  it('delimited table of two-byte rows', { timeout: CASE_TIMEOUT_MS }, async () => {
    const data = filled(
      kinds.delimited.maxBytes,
      Buffer.from('n\n', 'utf8'),
      Buffer.from('7\n', 'utf8'),
    );
    const { card } = await prepareAtSize(data, 'digits.csv', 'text/csv');
    expect(card).toMatchObject({ kind: 'delimited', state: 'ready' });
    expect(card?.coverage['table']).toMatchObject({ rowCount: (kinds.delimited.maxBytes - 2) / 2 });
  });

  it('text', { timeout: CASE_TIMEOUT_MS }, async () => {
    const data = filled(kinds.text.maxBytes, Buffer.alloc(0), seededLines(59, 1_000));
    const { card, stats } = await prepareAtSize(data, 'log.txt', 'text/plain');
    expect(card).toMatchObject({
      kind: 'text',
      state: 'ready_partial',
      textChars: CHAT_LARGE_FILE_POLICY.preparation.maxTextChars,
    });
    expect(stats.bytesRead).toBeLessThan(kinds.text.maxBytes);
  });

  it('HTML', { timeout: CASE_TIMEOUT_MS }, async () => {
    const data = filled(
      kinds.html.maxBytes,
      Buffer.from('<html><body>', 'utf8'),
      seededLines(61, 1_000),
    );
    const { card } = await prepareAtSize(data, 'page.html', 'text/html');
    expect(card).toMatchObject({ kind: 'html', state: 'ready_partial' });
  });

  it('notebook', { timeout: CASE_TIMEOUT_MS }, async () => {
    const { card } = await prepareAtSize(
      notebookOfSize(kinds.notebook.maxBytes),
      'model.ipynb',
      'application/x-ipynb+json',
    );
    expect(card).toMatchObject({ kind: 'notebook', state: 'ready' });
  });
});
