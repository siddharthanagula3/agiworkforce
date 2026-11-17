// @vitest-environment node
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type ArchiveBoundsModule = typeof import('@/lib/security/archive-bounds');

const inflated = vi.hoisted(() => [] as string[]);
const exhaustsBudget = vi.hoisted(() => new Set<string>());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/archive-bounds', async (importOriginal) => {
  const actual = await importOriginal<ArchiveBoundsModule>();
  return {
    ...actual,
    readArchiveMember: async (...args: Parameters<typeof actual.readArchiveMember>) => {
      inflated.push(args[0].name);
      const member = await actual.readArchiveMember(...args);
      const [entry, budget] = args;
      if (exhaustsBudget.has(entry.name)) budget.spend(budget.ceiling - budget.spent);
      return member;
    },
  };
});

import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { MAX_CELL_FORMATS } from '@agiworkforce/unified-chat/workbook-cell-formats';
import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { extractOfficeDocumentText } from '@/lib/server/office-document-text';
import { prepareChatFileStep, readPreparedCard, readPreparedText } from '..';
import { MAX_SHEET_PROFILES_BYTES, type SheetProfile } from '../spreadsheet';
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
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

beforeEach(() => {
  inflated.length = 0;
  exhaustsBudget.clear();
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
  stylesXml?: string;
  stylesTarget?: string;
  date1904?: boolean;
}): Promise<Buffer> {
  const zip = new JSZip();
  const workbookPr =
    options.date1904 === undefined
      ? ''
      : `<workbookPr date1904="${options.date1904 ? '1' : '0'}"/>`;
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${workbookPr}<sheets><sheet name="${options.sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  const stylesRelationship = options.stylesTarget
    ? `<Relationship Id="rId9" Type="${RELATIONSHIP_NS}/styles" Target="${options.stylesTarget}"/>`
    : '';
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>${stylesRelationship}</Relationships>`,
  );
  if (options.sharedStringsXml) zip.file('xl/sharedStrings.xml', options.sharedStringsXml);
  if (options.stylesXml !== undefined) {
    zip.file(`xl/${options.stylesTarget ?? 'styles.xml'}`, options.stylesXml);
  }
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

function xmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stylesXml(cellFormats: number[], custom: Record<number, string> = {}): string {
  const numFmts = Object.entries(custom)
    .map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${xmlAttribute(code)}"/>`)
    .join('');
  const cellXfs = cellFormats
    .map((id) => `<xf numFmtId="${id}" applyNumberFormat="1"><alignment/></xf>`)
    .join('');
  return `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
    numFmts ? `<numFmts count="${Object.keys(custom).length}">${numFmts}</numFmts>` : ''
  }<cellStyleXfs count="2"><xf numFmtId="14"/><xf numFmtId="9"/></cellStyleXfs><cellXfs count="${
    cellFormats.length
  }">${cellXfs}</cellXfs><dxfs count="1"><dxf><numFmt numFmtId="14" formatCode="0.00%"/></dxf></dxfs></styleSheet>`;
}

/** Style 1 is the built-in date format; the rest pad the part to the given counts. */
function boundedStylesXml(cellFormats: number, customFormats: number): string {
  const numFmts = Array.from(
    { length: customFormats },
    (_, index) => `<numFmt numFmtId="${164 + index}" formatCode=""/>`,
  ).join('');
  return `<styleSheet><numFmts>${numFmts}</numFmts><cellXfs><xf numFmtId="0"/>${'<xf numFmtId="14"/>'.repeat(
    cellFormats - 1,
  )}</cellXfs></styleSheet>`;
}

interface StyledCell {
  value: string;
  style?: string;
}

function styledSheet(header: string[], rows: StyledCell[][]): string {
  const column = (index: number) => String.fromCharCode(65 + index);
  const headerRow = `<row r="1">${header
    .map((name, index) => `<c r="${column(index)}1" t="inlineStr"><is><t>${name}</t></is></c>`)
    .join('')}</row>`;
  const dataRows = rows.map(
    (cells, rowIndex) =>
      `<row r="${rowIndex + 2}">${cells
        .map(
          (cell, index) =>
            `<c r="${column(index)}${rowIndex + 2}"${
              cell.style === undefined ? '' : ` s="${cell.style}"`
            }><v>${cell.value}</v></c>`,
        )
        .join('')}</row>`,
  );
  return sheetXml(headerRow + dataRows.join(''));
}

async function preparedSheet(data: Buffer): Promise<{ profile: SheetProfile; text: string }> {
  const db = new FakePreparationDb();
  const storage = createCountingStorage();
  const id = await sealed(db, storage, data);

  await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

  expect(db.rowForAsset(id)).toMatchObject({ state: 'ready', sheet_count: 1 });
  const profiles = db.rowForAsset(id)!.coverage['sheets'] as SheetProfile[];
  const text = (await readPreparedText(
    id,
    { startChar: 0, maxChars: 100_000 },
    { userId: USER, db, storage },
  ))!.text;
  return { profile: profiles[0]!, text };
}

function columnTypes(profile: SheetProfile): string[] {
  return (profile.columns ?? []).map((column) => `${column.name}: ${column.type}`);
}

describe('workbook preparation number formats', () => {
  it('gives the model dates, percentages and separated numbers as the workbook shows them and types a date column as dates', async () => {
    const { profile, text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Ledger',
        sheetXml: styledSheet(
          ['Day', 'Share', 'Rate', 'Units', 'Balance', 'Price', 'Cost', 'Count'],
          [
            [
              { value: '45292', style: '1' },
              { value: '0.285', style: '2' },
              { value: '0.12345', style: '3' },
              { value: '1234567.4', style: '4' },
              { value: '-1234.5', style: '5' },
              { value: '1.005', style: '6' },
              { value: '1234.5', style: '7' },
              { value: '42' },
            ],
            [
              { value: '45293', style: '1' },
              { value: '0.5', style: '2' },
              { value: '0', style: '3' },
              { value: '1000', style: '4' },
              { value: '2.5', style: '5' },
              { value: '3', style: '6' },
              { value: '7', style: '7' },
              { value: '8' },
            ],
          ],
        ),
        stylesXml: stylesXml([0, 14, 9, 10, 3, 4, 2, 164], { 164: '"$"#,##0.00' }),
      }),
    );

    expect(text).toContain(
      [
        'First 2 rows:',
        'Day,Share,Rate,Units,Balance,Price,Cost,Count',
        '2024-01-01,29%,12.35%,"1,234,567","-1,234.50",1.01,"$1,234.50",42',
        '2024-01-02,50%,0.00%,"1,000",2.50,3.00,$7.00,8',
      ].join('\n'),
    );
    expect(columnTypes(profile)).toEqual([
      'Day: date',
      'Share: number',
      'Rate: number',
      'Units: number',
      'Balance: number',
      'Price: number',
      'Cost: number',
      'Count: integer',
    ]);
    expect(text).toContain('- Day: date\n- Share: number');
  });

  it('reads serials in the 1904 date system when the workbook says so', async () => {
    const sheet = styledSheet(
      ['Day'],
      [[{ value: '43830', style: '1' }], [{ value: '0', style: '1' }]],
    );
    const styles = stylesXml([0, 14]);

    const in1904 = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: sheet,
        stylesXml: styles,
        date1904: true,
      }),
    );
    const in1900 = await preparedSheet(
      await singleSheetWorkbook({ sheetName: 'Days', sheetXml: sheet, stylesXml: styles }),
    );

    expect(in1904.text).toContain('First 2 rows:\nDay\n2024-01-01\n1904-01-01');
    expect(columnTypes(in1904.profile)).toEqual(['Day: date']);
    expect(in1900.text).toContain('First 2 rows:\nDay\n2019-12-31\n0');
  });

  it('gives a date and time, and a time only, from the fraction of the serial', async () => {
    const afternoon = String(45292 + (13 * 3600 + 47 * 60 + 30) / 86400);
    const { profile, text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Shifts',
        sheetXml: styledSheet(
          ['At', 'Clock', 'Precise', 'Stamp'],
          [
            [
              { value: afternoon, style: '1' },
              { value: afternoon, style: '2' },
              { value: afternoon, style: '3' },
              { value: afternoon, style: '4' },
            ],
          ],
        ),
        stylesXml: stylesXml([0, 22, 20, 21, 164], { 164: 'yyyy-mm-dd hh:mm:ss' }),
      }),
    );

    expect(text).toContain(
      'At,Clock,Precise,Stamp\n2024-01-01 13:47,13:47,13:47:30,2024-01-01 13:47:30',
    );
    expect(columnTypes(profile)).toEqual([
      'At: date',
      'Clock: text',
      'Precise: text',
      'Stamp: date',
    ]);
  });

  it('keeps the stored value for a format it cannot show faithfully or a style the file does not declare', async () => {
    const { profile, text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Raw',
        sheetXml: styledSheet(
          ['Science', 'Red', 'Signed', 'Thousands', 'Missing', 'Broken'],
          [
            [
              { value: '12345.678', style: '1' },
              { value: '12345.678', style: '2' },
              { value: '12345.678', style: '3' },
              { value: '12345.678', style: '4' },
              { value: '45292', style: '9' },
              { value: '45292', style: 'x' },
            ],
          ],
        ),
        stylesXml: stylesXml([0, 11, 164, 165, 166], {
          164: '[Red]0.00',
          165: '0.00;(0.00)',
          166: '#,##0,',
        }),
      }),
    );

    expect(text).toContain(
      'Science,Red,Signed,Thousands,Missing,Broken\n12345.678,12345.678,12345.678,12345.678,45292,45292',
    );
    expect(columnTypes(profile)).toEqual([
      'Science: number',
      'Red: number',
      'Signed: number',
      'Thousands: number',
      'Missing: integer',
      'Broken: integer',
    ]);
  });

  it('finds the styles part through the workbook relationships', async () => {
    const { text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Shares',
        sheetXml: styledSheet(['Share'], [[{ value: '0.25', style: '1' }]]),
        stylesXml: stylesXml([0, 9]),
        stylesTarget: 'theme/s.xml',
      }),
    );

    expect(text).toContain('Share\n25%');
  });

  it('gives stored values without failing when the styles part is missing, oversized or broken', async () => {
    const sheet = styledSheet(['Day'], [[{ value: '45292', style: '1' }]]);
    const variants: Buffer[] = [
      await singleSheetWorkbook({ sheetName: 'Days', sheetXml: sheet }),
      declareMemberSize(
        await singleSheetWorkbook({
          sheetName: 'Days',
          sheetXml: sheet,
          stylesXml: stylesXml([0, 14]),
        }),
        'xl/styles.xml',
        OVER_BUDGET_BYTES,
      ),
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: sheet,
        stylesXml: '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/>',
      }),
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: sheet,
        stylesXml: `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="${'y'.repeat(
          MAX_FILE_TEXT_CHARS + 1,
        )}"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      }),
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: sheet,
        stylesXml: boundedStylesXml(MAX_CELL_FORMATS + 1, 0),
      }),
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: sheet,
        stylesXml: boundedStylesXml(2, MAX_CELL_FORMATS + 1),
      }),
    ];

    for (const data of variants) {
      inflated.length = 0;
      const { profile, text } = await preparedSheet(data);
      expect(text).toContain('First 1 rows:\nDay\n45292');
      expect(columnTypes(profile)).toEqual(['Day: integer']);
    }
    expect(inflated).toContain('xl/styles.xml');
    inflated.length = 0;
    await preparedSheet(variants[1]!);
    expect(inflated).not.toContain('xl/styles.xml');
  });

  it('formats numbers when the styles part holds exactly as many cell and custom formats as the bound allows', async () => {
    const { profile, text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: styledSheet(['Day'], [[{ value: '45292', style: '1' }]]),
        stylesXml: boundedStylesXml(MAX_CELL_FORMATS, MAX_CELL_FORMATS),
      }),
    );

    expect(text).toContain('First 1 rows:\nDay\n2024-01-01');
    expect(columnTypes(profile)).toEqual(['Day: date']);
  });

  it('reads the styles part after the first sheet, so a styles part that fills the budget cannot crowd the sheet out', async () => {
    exhaustsBudget.add('xl/styles.xml');
    const { profile, text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: styledSheet(['Day'], [[{ value: '45292', style: '1' }]]),
        stylesXml: stylesXml([0, 14]),
      }),
    );

    expect(inflated.indexOf('xl/worksheets/sheet1.xml')).toBeGreaterThanOrEqual(0);
    expect(inflated.indexOf('xl/styles.xml')).toBeGreaterThan(
      inflated.indexOf('xl/worksheets/sheet1.xml'),
    );
    expect(profile).toMatchObject({ name: 'Days', profiled: true, rowCount: 1 });
    expect(text).toContain('First 1 rows:\nDay\n2024-01-01');
  });

  it('does not read the styles part when no sheet could be read', async () => {
    const data = declareMemberSize(
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: styledSheet(['Day'], [[{ value: '45292', style: '1' }]]),
        stylesXml: stylesXml([0, 14]),
      }),
      'xl/worksheets/sheet1.xml',
      OVER_BUDGET_BYTES,
    );
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(db, storage, data);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready_partial' });
    expect(db.rowForAsset(id)!.coverage['sheets']).toEqual([{ name: 'Days', profiled: false }]);
    expect(inflated).not.toContain('xl/styles.xml');
  });

  it('keeps the stored value for a format code with a character reference outside Unicode and formats the rest', async () => {
    const { text } = await preparedSheet(
      await singleSheetWorkbook({
        sheetName: 'Days',
        sheetXml: styledSheet(
          ['Coded', 'Day'],
          [
            [
              { value: '45292', style: '1' },
              { value: '45292', style: '2' },
            ],
          ],
        ),
        stylesXml:
          '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="&#x110000;0"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>',
      }),
    );

    expect(text).toContain('Coded,Day\n45292,2024-01-01');
  });
});
