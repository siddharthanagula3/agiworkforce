// @vitest-environment node
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type ArchiveBoundsModule = typeof import('@/lib/security/archive-bounds');

const inflated = vi.hoisted(() => [] as string[]);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/archive-bounds', async (importOriginal) => {
  const actual = await importOriginal<ArchiveBoundsModule>();
  return {
    ...actual,
    readArchiveMember: (...args: Parameters<typeof actual.readArchiveMember>) => {
      inflated.push(args[0].name);
      return actual.readArchiveMember(...args);
    },
  };
});

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { extractOfficeDocumentText } from '@/lib/server/office-document-text';
import { prepareChatFileStep, readPreparedCard, readPreparedText } from '..';
import { MAX_SHEET_PROFILES_BYTES } from '../spreadsheet';
import {
  createCountingStorage,
  FakePreparationDb,
  prepareUntilDone,
  seededRandom,
  storeSource,
  testUuid,
  USER,
  type CountingStorage,
} from './preparation-harness';

const MIB = 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OVER_BUDGET_BYTES = 300 * MIB;
const LEDGER_ROWS = 600;
const SAMPLE_ROWS = CHAT_LARGE_FILE_POLICY.kinds.spreadsheet.sampleRows;

beforeEach(() => {
  inflated.length = 0;
});

function ledgerSheet(): string {
  const random = seededRandom(17);
  const rows = [
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>',
  ];
  for (let index = 2; index <= LEDGER_ROWS + 1; index += 1) {
    rows.push(
      `<row r="${index}"><c r="A${index}"><v>${index - 1}</v></c><c r="B${index}"><v>${(random() * 1000).toFixed(2)}</v></c><c r="C${index}" t="b"><v>${random() > 0.5 ? 1 : 0}</v></c><c r="D${index}" t="inlineStr"><is><t>Region ${index % 7}</t></is></c></row>`,
    );
  }
  return `<?xml version="1.0"?><worksheet><dimension ref="A1:D${LEDGER_ROWS + 1}"/><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

/** Three sheets; the second declares more inflated bytes than the archive budget allows. */
async function buildWorkbook(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/><sheet name="Archive" sheetId="2" r:id="rId2"/><sheet name="Notes" sheetId="3" r:id="rId3"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    '<?xml version="1.0"?><sst><si><t>Entry</t></si><si><t>Amount</t></si><si><t>Settled</t></si><si><t>Region</t></si></sst>',
  );
  zip.file('xl/worksheets/sheet1.xml', ledgerSheet());
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
  );
  zip.file(
    'xl/worksheets/sheet3.xml',
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
  );
  zip.file('xl/media/chart-cache.bin', Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x5a), {
    compression: 'STORE',
  });
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return declareMemberSize(archive, 'xl/worksheets/sheet2.xml', OVER_BUDGET_BYTES);
}

function declareMemberSize(archive: Buffer, path: string, size: number): Buffer {
  const result = Buffer.from(archive);
  const end = result.length - 22;
  expect(result.readUInt32LE(end)).toBe(0x06054b50);
  let offset = result.readUInt32LE(end + 16);
  while (result.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = result.readUInt16LE(offset + 28);
    const extraLength = result.readUInt16LE(offset + 30);
    const commentLength = result.readUInt16LE(offset + 32);
    const name = result.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === path) {
      const localOffset = result.readUInt32LE(offset + 42);
      expect(result.readUInt32LE(localOffset)).toBe(0x04034b50);
      result.writeUInt32LE(size, offset + 24);
      result.writeUInt32LE(size, localOffset + 22);
      return result;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Fixture member missing: ${path}`);
}

/** One sheet with the given XML, padded past the inline limit with a stored media member. */
async function singleSheetWorkbook(options: {
  sheetName: string;
  sheetXml: string;
  sharedStringsXml?: string;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${options.sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  if (options.sharedStringsXml) zip.file('xl/sharedStrings.xml', options.sharedStringsXml);
  zip.file('xl/worksheets/sheet1.xml', options.sheetXml);
  zip.file('xl/media/chart-cache.bin', Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x5a), {
    compression: 'STORE',
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function sheetXml(rows: string): string {
  return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
}

async function sealed(
  db: FakePreparationDb,
  storage: CountingStorage,
  data: Buffer,
  byteSize: number = data.byteLength,
): Promise<string> {
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.sealed`;
  await storeSource(storage, key, data, XLSX_TYPE);
  db.addAsset({
    id,
    mime_type: XLSX_TYPE,
    storage_pathname: key,
    filename: 'ledger.xlsx',
    byte_size: byteSize,
  });
  return id;
}

describe('workbook preparation', () => {
  it('profiles the sheets that fit the budget and lists the rest by name', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await buildWorkbook();
    const id = await sealed(db, storage, data);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ kind: 'spreadsheet', state: 'ready_partial', sheetCount: 3 });
    expect(card?.coverage['sheets']).toEqual([
      {
        name: 'Ledger',
        profiled: true,
        dimension: `A1:D${LEDGER_ROWS + 1}`,
        rowCount: LEDGER_ROWS,
        columns: [
          { name: 'Entry', type: 'integer' },
          { name: 'Amount', type: 'number' },
          { name: 'Settled', type: 'boolean' },
          { name: 'Region', type: 'text' },
        ],
      },
      { name: 'Archive', profiled: false },
      { name: 'Notes', profiled: false },
    ]);
    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 1_000_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toContain(
      `## Sheet: Ledger (A1:D${LEDGER_ROWS + 1})\n${LEDGER_ROWS} rows after the header, 4 columns.`,
    );
    expect(text).toContain(`First ${SAMPLE_ROWS} rows:\nEntry,Amount,Settled,Region\n1,`);
    expect(text).toContain(`\n${SAMPLE_ROWS},`);
    expect(text).not.toContain(`\n${SAMPLE_ROWS + 1},`);
    expect(text).toContain(
      'Sheets not profiled, because the workbook is larger than can be read here',
    );
    expect(text).toContain(': Archive, Notes');
    expect(inflated).not.toContain('xl/worksheets/sheet2.xml');
    expect(inflated).not.toContain('xl/media/chart-cache.bin');

    await expect(extractOfficeDocumentText(data, 'ledger.xlsx', 'xlsx')).rejects.toMatchObject({
      reason: 'archive_bomb',
    });
  });

  it('reads a self-closing cell or row as empty and keeps the cells after it in their columns', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await singleSheetWorkbook({
      sheetName: 'Parts',
      sharedStringsXml:
        '<?xml version="1.0"?><sst><si><t>Code</t></si><si><t>Amount</t></si><si><t>X9</t></si></sst>',
      sheetXml: sheetXml(
        [
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
          '<row r="2"><c r="A2" s="3"/><c r="B2"><v>42</v></c></row>',
          '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>7</v></c><c r="C3" s="1" /></row>',
          '<row r="4" ht="20" customHeight="1"/>',
          '<row r="5"><c r="A5" t="inlineStr"><is><t>a/b</t></is></c><c r="B5"><v>5</v></c></row>',
        ].join(''),
      ),
    });
    const id = await sealed(db, storage, data);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ state: 'ready', sheetCount: 1 });
    expect(card?.coverage['sheets']).toEqual([
      {
        name: 'Parts',
        profiled: true,
        rowCount: 3,
        columns: [
          { name: 'Code', type: 'text' },
          { name: 'Amount', type: 'integer' },
        ],
      },
    ]);
    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 100_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toContain('First 3 rows:\nCode,Amount\n,42\nX9,7\na/b,5');
  });

  it('stores sheet and column names Postgres can hold, without NUL or an unpaired surrogate', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await singleSheetWorkbook({
      sheetName: 'Led&#0;ger',
      sheetXml: sheetXml(
        [
          '<row r="1"><c r="A1" t="inlineStr"><is><t>Amo&#0;unt</t></is></c><c r="B1" t="inlineStr"><is><t>Note&#xD800;</t></is></c></row>',
          '<row r="2"><c r="A2"><v>3</v></c><c r="B2" t="inlineStr"><is><t>fine</t></is></c></row>',
        ].join(''),
      ),
    });
    const id = await sealed(db, storage, data);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ state: 'ready', sheetCount: 1 });
    expect(card?.coverage['sheets']).toEqual([
      {
        name: 'Ledger',
        profiled: true,
        rowCount: 1,
        columns: [
          { name: 'Amount', type: 'integer' },
          { name: 'Note�', type: 'text' },
        ],
      },
    ]);
  });

  it('refuses a character reference outside Unicode as unreadable instead of retrying it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await singleSheetWorkbook({
      sheetName: 'Codes',
      sheetXml: sheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>&#x110000;</t></is></c></row>'),
    });
    const id = await sealed(db, storage, data);

    const result = await prepareChatFileStep(id, { db, storage });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({ error: 'unreadable', derived_keys: [] });
  });

  it(
    'reads past unclosed row, cell and shared-string openers in time linear in the XML',
    { timeout: 10_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const openers = 120_000;
      const data = await singleSheetWorkbook({
        sheetName: 'Ragged',
        sharedStringsXml: `<?xml version="1.0"?><sst><si><t>Code</t></si>${'<si>'.repeat(openers)}</sst>`,
        sheetXml: sheetXml(
          [
            '<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
            '<row r="2"><c r="A2"><v>11</v></c></row>',
            `<row r="3"><c r="A3"><v>12</v></c><c r="C3">${'<v>'.repeat(openers * 2)}</c>${'<c r="B3">'.repeat(openers / 2)}</row>`,
            '<row>'.repeat(openers),
          ].join(''),
        ),
      });
      const id = await sealed(db, storage, data);

      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

      const card = await readPreparedCard(id, { userId: USER, db, storage });
      expect(card?.coverage['sheets']).toEqual([
        {
          name: 'Ragged',
          profiled: true,
          rowCount: 2,
          columns: [{ name: 'Code', type: 'integer' }],
        },
      ]);
    },
  );

  it(
    'types a 200,000-digit cell that ends in a letter in time linear in its length',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const data = await singleSheetWorkbook({
        sheetName: 'Codes',
        sheetXml: sheetXml(
          [
            '<row r="1"><c r="A1" t="inlineStr"><is><t>Code</t></is></c></row>',
            `<row r="2"><c r="A2"><v>${'1'.repeat(200_000)}x</v></c></row>`,
          ].join(''),
        ),
      });
      const id = await sealed(db, storage, data);

      const started = performance.now();
      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
      const elapsed = performance.now() - started;

      expect(db.rowForAsset(id)!.coverage['sheets']).toEqual([
        { name: 'Codes', profiled: true, rowCount: 1, columns: [{ name: 'Code', type: 'text' }] },
      ]);
      expect(elapsed).toBeLessThan(5_000);
    },
  );

  it('keeps the stored sheet profile within its budget and says which sheets lost their columns', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const sheets = 100;
    const columns = 256;
    const letters = (index: number) =>
      index < 26
        ? String.fromCharCode(65 + index)
        : `${String.fromCharCode(64 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
    const names = Array.from(
      { length: columns },
      (_, index) => `${String(index).padStart(3, '0')}${'n'.repeat(97)}`,
    );
    const header = names
      .map((_, index) => `<c r="${letters(index)}1" t="s"><v>${index}</v></c>`)
      .join('');
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${Array.from(
        { length: sheets },
        (_, index) => `<sheet name="S${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      ).join('')}</sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0"?><Relationships>${Array.from(
        { length: sheets },
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
      ).join('')}</Relationships>`,
    );
    zip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0"?><sst>${names.map((name) => `<si><t>${name}</t></si>`).join('')}</sst>`,
    );
    for (let index = 1; index <= sheets; index += 1) {
      zip.file(
        `xl/worksheets/sheet${index}.xml`,
        sheetXml(`<row r="1">${header}</row><row r="2"><c r="A2"><v>${index}</v></c></row>`),
      );
    }
    zip.file('xl/media/chart-cache.bin', Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x5a), {
      compression: 'STORE',
    });
    const id = await sealed(
      db,
      storage,
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const row = db.rowForAsset(id)!;
    const profiles = row.coverage['sheets'] as {
      name: string;
      rowCount?: number;
      columns?: unknown[];
      columnsOmitted?: boolean;
    }[];
    expect(row).toMatchObject({ state: 'ready', sheet_count: sheets });
    expect(Buffer.byteLength(JSON.stringify(profiles), 'utf8')).toBeLessThanOrEqual(
      MAX_SHEET_PROFILES_BYTES,
    );
    expect(profiles).toHaveLength(sheets);
    expect(profiles[0]!.columns).toHaveLength(columns);
    expect(profiles.at(-1)).toEqual({
      name: `S${sheets}`,
      profiled: true,
      rowCount: 1,
      columnsOmitted: true,
    });
    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toContain(
      `## Sheet: S${sheets}\n1 rows after the header, ${columns} columns.\n- 000n`,
    );
  });

  it('stops collecting sheet text once it fills the text cap and lists the remaining sheets as not profiled', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const sheets = 6;
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${Array.from(
        { length: sheets },
        (_, index) => `<sheet name="S${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      ).join('')}</sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0"?><Relationships>${Array.from(
        { length: sheets },
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
      ).join('')}</Relationships>`,
    );
    for (let index = 1; index <= sheets; index += 1) {
      zip.file(
        `xl/worksheets/sheet${index}.xml`,
        sheetXml(
          `<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${'x'.repeat(150)}</t></is></c></row>`,
        ),
      );
    }
    zip.file('xl/media/chart-cache.bin', Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x5a), {
      compression: 'STORE',
    });
    const id = await sealed(
      db,
      storage,
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    );
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      preparation: { ...CHAT_LARGE_FILE_POLICY.preparation, maxTextChars: 400 },
    };

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));

    const profiles = db.rowForAsset(id)!.coverage['sheets'] as {
      name: string;
      profiled: boolean;
    }[];
    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready_partial', sheet_count: sheets });
    expect(profiles.map((sheet) => sheet.profiled)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(inflated).not.toContain('xl/worksheets/sheet3.xml');
    expect(inflated).not.toContain('xl/worksheets/sheet6.xml');
  });

  it('refuses a workbook over the spreadsheet limit without reading it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      Buffer.alloc(16, 0x20),
      CHAT_LARGE_FILE_POLICY.kinds.spreadsheet.maxBytes + 1,
    );

    const result = await prepareChatFileStep(id, { db, storage });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({ error: 'over_kind_limit' });
    expect(storage.stats).toMatchObject({ reads: 0, heads: 0 });
  });

  it('refuses a stored object whose length is not the sealed size', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await buildWorkbook();
    const id = await sealed(db, storage, data, data.byteLength + 1);

    await prepareChatFileStep(id, { db, storage });

    expect(db.rowForAsset(id)).toMatchObject({
      state: 'prepare_failed',
      error: 'source_size_mismatch',
    });
    expect(storage.stats.reads).toBe(0);
  });
});
