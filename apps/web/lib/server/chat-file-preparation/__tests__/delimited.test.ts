// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { prepareChatFileStep, readPreparedCard, readPreparedText } from '..';
import {
  initialDelimitedCursor,
  MAX_DELIMITED_CURSOR_BYTES,
  readDelimitedBatch,
  splitDelimitedFields,
  valueType,
} from '../delimited';
import {
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
const STEP_BYTES = 4 * MIB;

const smallSteps = {
  ...CHAT_LARGE_FILE_POLICY,
  kinds: {
    ...CHAT_LARGE_FILE_POLICY.kinds,
    delimited: { ...CHAT_LARGE_FILE_POLICY.kinds.delimited, bytesPerStep: STEP_BYTES },
  },
};

/** Character-at-a-time reading of a record, the reading the step's splitter must keep. */
function referenceFields(record: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const char = record[index]!;
    if (quoted) {
      if (char === '"' && record[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

interface Table {
  data: Buffer;
  rows: number;
}

/** Rows whose notes field is quoted and often holds line breaks, so step edges land inside quotes. */
function buildCsv(seed: number, delimiter: ',' | '\t' = ','): Table {
  const random = seededRandom(seed);
  const header = ['id', 'amount', 'active', 'opened', 'notes'].join(delimiter);
  const lines = [header];
  let length = header.length + 1;
  let rows = 0;
  while (length < MAX_CHAT_ATTACHMENT_BYTES + 3 * MIB) {
    rows += 1;
    const words = seededWords(random, 8);
    const notes =
      delimiter === ','
        ? `"${words}\nsecond line, with ""quotes""\n${seededWords(random, 3)}"`
        : `"${words}`;
    const line = [
      String(rows),
      (random() * 10_000).toFixed(2),
      random() > 0.5 ? 'true' : 'false',
      `2026-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-15`,
      notes,
    ].join(delimiter);
    lines.push(line);
    length += Buffer.byteLength(line, 'utf8') + 2;
  }
  return { data: Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8'), rows };
}

async function sealed(
  db: FakePreparationDb,
  storage: CountingStorage,
  data: Buffer,
  filename: string,
  mimeType: string,
  id = testUuid(),
) {
  const key = `chat-attachments/${USER}/${id}.sealed`;
  await storeSource(storage, key, data, mimeType);
  db.addAsset({
    id,
    mime_type: mimeType,
    storage_pathname: key,
    filename,
    byte_size: data.byteLength,
  });
  return id;
}

async function profileText(
  db: FakePreparationDb,
  storage: CountingStorage,
  id: string,
): Promise<string> {
  const slice = await readPreparedText(
    id,
    { startChar: 0, maxChars: 4_000_000 },
    { userId: USER, db, storage },
  );
  return slice?.text ?? '';
}

describe('delimited preparation', () => {
  it(
    'counts every row and types every column when quoted line breaks cross step edges',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const table = buildCsv(3);
      const id = await sealed(db, storage, table.data, 'ledger.csv', 'text/csv');
      let largestCursor = 0;
      db.beforeAdvance = () => {
        const cursor = db.rowForAsset(id)?.cursor;
        largestCursor = Math.max(
          largestCursor,
          Buffer.byteLength(JSON.stringify(cursor ?? {}), 'utf8'),
        );
      };

      const steps = await prepareUntilDone(() =>
        prepareChatFileStep(id, { db, storage, policy: smallSteps }),
      );

      expect(steps).toBeGreaterThanOrEqual(Math.ceil(table.data.byteLength / STEP_BYTES));
      const card = await readPreparedCard(id, { userId: USER, db, storage });
      expect(card?.state).toBe('ready');
      expect(card?.coverage['table']).toEqual({
        rowCount: table.rows,
        columnCount: 5,
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'amount', type: 'number' },
          { name: 'active', type: 'boolean' },
          { name: 'opened', type: 'date' },
          { name: 'notes', type: 'text' },
        ],
        columnsTruncated: false,
        delimiter: 'comma',
      });
      const text = await profileText(db, storage, id);
      expect(text).toContain(
        `${table.rows.toLocaleString('en-US')} rows after the header, 5 columns.`,
      );
      expect(text).toContain(`First ${CHAT_LARGE_FILE_POLICY.kinds.delimited.sampleRows} rows:`);
      expect(text).toContain(
        `${CHAT_LARGE_FILE_POLICY.kinds.delimited.sampleRows} rows sampled at random from the whole file:`,
      );
      expect(largestCursor).toBeGreaterThan(0);
      expect(largestCursor).toBeLessThanOrEqual(MAX_DELIMITED_CURSOR_BYTES);
    },
  );

  it(
    'resumes a retried step at its cursor and ends with the same profile',
    { timeout: 60_000 },
    async () => {
      const table = buildCsv(9);
      const assetId = testUuid();

      const cleanDb = new FakePreparationDb();
      const cleanStorage = createCountingStorage();
      await sealed(cleanDb, cleanStorage, table.data, 'ledger.csv', 'text/csv', assetId);
      await prepareUntilDone(() =>
        prepareChatFileStep(assetId, { db: cleanDb, storage: cleanStorage, policy: smallSteps }),
      );

      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      await sealed(db, storage, table.data, 'ledger.csv', 'text/csv', assetId);
      await prepareChatFileStep(assetId, { db, storage, policy: smallSteps });
      await prepareChatFileStep(assetId, { db, storage, policy: smallSteps });
      const offset = Number(db.rowForAsset(assetId)!.cursor['byteOffset']);
      expect(offset).toBeGreaterThan(STEP_BYTES);

      db.failNextAdvance = true;
      await expect(
        prepareChatFileStep(assetId, { db, storage, policy: smallSteps }),
      ).rejects.toThrow('connection reset during advance');
      expect(Number(db.rowForAsset(assetId)!.cursor['byteOffset'])).toBe(offset);
      const failedRange = storage.stats.ranges.at(-1);
      await prepareChatFileStep(assetId, { db, storage, policy: smallSteps });
      expect(storage.stats.ranges.at(-1)).toBe(failedRange);
      expect(failedRange).toMatch(new RegExp(`^bytes=${offset}-`));

      await prepareUntilDone(() =>
        prepareChatFileStep(assetId, { db, storage, policy: smallSteps }),
      );
      expect(db.rowForAsset(assetId)!.coverage).toEqual(cleanDb.rowForAsset(assetId)!.coverage);
      expect(db.rowForAsset(assetId)!.derived_keys).toEqual(
        cleanDb.rowForAsset(assetId)!.derived_keys,
      );
      expect(await profileText(db, storage, assetId)).toBe(
        await profileText(cleanDb, cleanStorage, assetId),
      );
    },
  );

  it(
    'reads a TSV by its extension and treats a quote as an ordinary character',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const table = buildCsv(5, '\t');
      const id = await sealed(db, storage, table.data, 'export.tsv', 'text/plain');

      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy: smallSteps }));

      expect(db.rowForAsset(id)).toMatchObject({ kind: 'delimited', state: 'ready' });
      expect(db.rowForAsset(id)!.coverage['table']).toMatchObject({
        rowCount: table.rows,
        delimiter: 'tab',
      });
    },
  );

  it(
    'reads a stray quote inside an unquoted field as a character, not the start of a quoted field',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const random = seededRandom(21);
      const lines = ['id,size,notes'];
      let length = lines[0]!.length + 1;
      while (length < MAX_CHAT_ATTACHMENT_BYTES + 3 * MIB) {
        const line = `${lines.length},${1 + Math.floor(random() * 9)}" pipe,${seededWords(random, 3)}`;
        lines.push(line);
        length += Buffer.byteLength(line, 'utf8') + 1;
      }
      const id = await sealed(
        db,
        storage,
        Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
        'parts.csv',
        'text/csv',
      );

      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy: smallSteps }));

      expect(db.rowForAsset(id)).toMatchObject({ state: 'ready' });
      expect(db.rowForAsset(id)!.coverage['table']).toMatchObject({
        rowCount: lines.length - 1,
        columnCount: 3,
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'size', type: 'text' },
          { name: 'notes', type: 'text' },
        ],
      });
    },
  );

  it(
    'drops NUL from a header name and a sampled row rather than failing the step on every retry',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const table = buildCsv(11);
      const firstNotes = table.data.indexOf('"');
      const data = Buffer.concat([
        Buffer.from('i\u0000', 'utf8'),
        table.data.subarray(1, firstNotes + 1),
        Buffer.from('\u0000', 'utf8'),
        table.data.subarray(firstNotes + 1),
      ]);
      const id = await sealed(db, storage, data, 'ledger.csv', 'text/csv');

      const steps = await prepareUntilDone(() =>
        prepareChatFileStep(id, { db, storage, policy: smallSteps }),
      );

      expect(steps).toBeGreaterThan(1);
      expect(db.rowForAsset(id)).toMatchObject({ state: 'ready' });
      expect(db.rowForAsset(id)!.coverage['table']).toMatchObject({
        rowCount: table.rows,
        columns: expect.arrayContaining([{ name: 'id', type: 'integer' }]),
      });
      const text = await profileText(db, storage, id);
      expect(text).not.toContain('\u0000');
      expect(text).toContain('\nid,amount,active,opened,notes\n1,');
    },
  );

  it('counts a range of two-byte rows', { timeout: 60_000 }, async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const rows = Math.ceil((MAX_CHAT_ATTACHMENT_BYTES + MIB) / 2);
    const data = Buffer.alloc(2 + rows * 2, '7\n');
    data.write('n\n', 0, 'utf8');
    const id = await sealed(db, storage, data, 'digits.csv', 'text/csv');

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)!.coverage['table']).toMatchObject({
      rowCount: rows,
      columns: [{ name: 'n', type: 'integer' }],
    });
  });

  it('refuses invalid UTF-8', { timeout: 60_000 }, async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const table = buildCsv(4);
    table.data[STEP_BYTES + 100] = 0xc3;
    table.data[STEP_BYTES + 101] = 0x28;
    const id = await sealed(db, storage, table.data, 'ledger.csv', 'text/csv');

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy: smallSteps }));

    expect(db.rowForAsset(id)).toMatchObject({
      state: 'prepare_failed',
      error: 'invalid_utf8',
      derived_keys: [],
    });
  });

  it(
    'types a 200,000-digit cell that ends in a letter in time linear in its length',
    { timeout: 60_000 },
    async () => {
      const prepareCell = async (cell: string) => {
        const db = new FakePreparationDb();
        const storage = createCountingStorage();
        const data = Buffer.concat([
          Buffer.from(`id,code\n1,${cell}\n`, 'utf8'),
          Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, `2,${'z'.repeat(1_021)}\n`),
        ]);
        const id = await sealed(db, storage, data, 'codes.csv', 'text/csv');
        const started = performance.now();
        await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
        return { db, id, elapsed: performance.now() - started };
      };

      const baseline = await prepareCell('z'.repeat(200_001));
      const digits = await prepareCell(`${'1'.repeat(200_000)}x`);

      expect(digits.db.rowForAsset(digits.id)).toMatchObject({ state: 'ready' });
      expect(digits.db.rowForAsset(digits.id)!.coverage['table']).toMatchObject({
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'code', type: 'text' },
        ],
      });
      expect(digits.elapsed).toBeLessThan(baseline.elapsed * 4 + 1_000);
    },
  );

  it('types a 1 MiB run of digits ending in a letter, a letter run and a long number in time linear in the field', () => {
    const digitsThenLetter = `${'1'.repeat(MIB)}x`;
    const exponentTail = `${'1'.repeat(MIB)}e`;
    const decimalTail = `1.${'1'.repeat(MIB)}x`;

    const started = performance.now();
    const types = [
      digitsThenLetter,
      exponentTail,
      decimalTail,
      '9'.repeat(MIB),
      'a'.repeat(MIB),
    ].map(valueType);
    const elapsed = performance.now() - started;

    expect(types).toEqual(['text', 'text', 'text', 'text', 'text']);
    expect(elapsed).toBeLessThan(1_000);
    expect(valueType('1234567890')).toBe('integer');
    expect(valueType('-12.5e3')).toBe('number');
    expect(valueType('2026-11-15')).toBe('date');
  });

  it('splits a 1 MiB field of doubled quotes, an unclosed quote and a long unquoted field in linear time', () => {
    const doubled = `"${'b""'.repeat(Math.floor(MIB / 3))}",tail`;
    const unclosed = `1,"${'q'.repeat(MIB)}`;
    const strayQuotes = `1,${'q"'.repeat(Math.floor(MIB / 2))}`;
    const unquoted = `${'z'.repeat(MIB)},${'y'.repeat(MIB)}`;

    const started = performance.now();
    const fields = [doubled, unclosed, strayQuotes, unquoted].map((record) =>
      splitDelimitedFields(record, ','),
    );
    const elapsed = performance.now() - started;

    expect(fields[0]).toHaveLength(2);
    expect(fields[0]![0]).toBe('b"'.repeat(Math.floor(MIB / 3)));
    expect(fields[1]!.map((field) => field.length)).toEqual([1, MIB]);
    expect(fields[2]).toHaveLength(2);
    expect(fields[3]!.map((field) => field.length)).toEqual([MIB, MIB]);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('splits a record of 200,000 short quoted fields with no doubled quote in time linear in the record', () => {
    const fieldCount = 200_000;
    const record = '"a",'.repeat(fieldCount - 1) + '"a"';
    const mixed = `"x""y",${record}`;

    const started = performance.now();
    const fields = splitDelimitedFields(record, ',');
    const mixedFields = splitDelimitedFields(mixed, ',');
    const elapsed = performance.now() - started;

    expect(fields).toHaveLength(fieldCount);
    expect(fields.every((field) => field === 'a')).toBe(true);
    expect(mixedFields).toHaveLength(fieldCount + 1);
    expect(mixedFields[0]).toBe('x"y');
    expect(mixedFields.slice(1).every((field) => field === 'a')).toBe(true);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('reads doubled quotes in a quoted field that is followed by quoted fields without them', () => {
    expect(splitDelimitedFields('"a","""","b ""c"" d"', ',')).toEqual(['a', '"', 'b "c" d']);
    expect(splitDelimitedFields('"a""","b"', ',')).toEqual(['a"', 'b']);
    expect(splitDelimitedFields('"he said ""hi"", then left",2', ',')).toEqual([
      'he said "hi", then left',
      '2',
    ]);
    expect(splitDelimitedFields('"unclosed ""x"" ,1', ',')).toEqual(['unclosed "x" ,1']);
  });

  it(
    'reads a quoted field of 26 MiB in the first row under the shipped policy',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const data = Buffer.concat([
        Buffer.from('id,body\n1,"', 'utf8'),
        Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x62),
        Buffer.from('"\n2,short\n', 'utf8'),
      ]);
      const id = await sealed(db, storage, data, 'ledger.csv', 'text/csv');

      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

      expect(db.rowForAsset(id)).toMatchObject({ state: 'ready' });
      expect(db.rowForAsset(id)!.coverage['table']).toMatchObject({
        rowCount: 2,
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'body', type: 'text' },
        ],
      });
    },
  );

  it('splits a long quoted field without holding more than the record', () => {
    const record = `1,"${'b'.repeat(4_000_000)}",tail`;
    expect(record.charCodeAt(record.length - 1)).toBe(0x6c);
    const before = process.memoryUsage().heapUsed;

    const fields = splitDelimitedFields(record, ',');
    const retained = process.memoryUsage().heapUsed - before;

    expect(fields.map((field) => field.length)).toEqual([1, 4_000_000, 4]);
    expect(retained).toBeLessThan(32 * MIB);
  });

  it('reads a long quoted field full of doubled quotes without holding tens of bytes per character', () => {
    const pairs = 1_333_333;
    const record = `"${'b""'.repeat(pairs)}",2`;
    expect(record.charCodeAt(record.length - 1)).toBe(0x32);
    const before = process.memoryUsage().heapUsed;

    const fields = splitDelimitedFields(record, ',');
    const grown = process.memoryUsage().heapUsed - before;

    expect(fields).toHaveLength(2);
    expect(fields[0]).toBe('b"'.repeat(pairs));
    expect(fields[1]).toBe('2');
    expect(grown).toBeLessThan(48 * MIB);
  });

  it('splits comma-separated fields as a quote-aware reader of RFC 4180 records does', () => {
    const random = seededRandom(31);
    const alphabet = ['a', 'b', '"', '"', ',', ' '];
    for (let sample = 0; sample < 5_000; sample += 1) {
      let record = '';
      const length = Math.floor(random() * 24);
      for (let index = 0; index < length; index += 1) {
        record += alphabet[Math.floor(random() * alphabet.length)]!;
      }
      expect(splitDelimitedFields(record, ','), record).toEqual(referenceFields(record));
    }
    expect(splitDelimitedFields('"a ""quoted"" word",b', ',')).toEqual(['a "quoted" word', 'b']);
    expect(splitDelimitedFields('x"y,"open', ',')).toEqual(['x"y', 'open']);
    expect(splitDelimitedFields('a\t"b"\tc', '\t')).toEqual(['a', '"b"', 'c']);
  });

  it('refuses a record longer than one step', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = Buffer.concat([
      Buffer.from('id,body\n1,"', 'utf8'),
      Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x62),
      Buffer.from('"\n', 'utf8'),
    ]);
    const id = await sealed(db, storage, data, 'ledger.csv', 'text/csv');

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy: smallSteps }));

    expect(db.rowForAsset(id)).toMatchObject({ state: 'prepare_failed', error: 'row_too_long' });
  });
});

describe('sampled rows longer than their bound', () => {
  const CUT_NOTE = 'A value too long to show in a sample row is cut and ends with "…".';

  async function profileOf(
    table: string,
    delimiter: ',' | '\t' = ',',
  ): Promise<{ text: string; rows: string[] }> {
    const storage = createCountingStorage();
    const key = `chat-attachments/${USER}/${testUuid()}.sealed`;
    const data = Buffer.from(table, 'utf8');
    await storeSource(storage, key, data, 'text/csv');
    const batch = await readDelimitedBatch({
      storage,
      key,
      byteCount: data.byteLength,
      cursor: initialDelimitedCursor(delimiter, key),
      policy: CHAT_LARGE_FILE_POLICY,
    });
    const text = batch.text ?? '';
    const from = text.indexOf('rows:\n') + 'rows:\n'.length;
    const rows = text.slice(from).split('\n\n')[0]!.split('\n').slice(1);
    return { text, rows };
  }

  it('cuts a long value, marks it, and keeps the values after it and the rows after it whole', async () => {
    const note = `first, "quoted" ${'word '.repeat(420)}`;
    const { text, rows } = await profileOf(
      `id,note,amount\n1,"${note.replaceAll('"', '""')}",98765\n2,short,5\n`,
    );

    expect(rows).toHaveLength(2);
    const fields = splitDelimitedFields(rows[0]!, ',');
    expect(fields).toHaveLength(3);
    expect(fields[0]).toBe('1');
    expect(fields[1]!.startsWith('first, "quoted" word ')).toBe(true);
    expect(fields[1]!.endsWith('…')).toBe(true);
    expect(fields[2]).toBe('98765');
    expect(Buffer.byteLength(JSON.stringify(rows[0]), 'utf8')).toBeLessThanOrEqual(2048);
    expect(rows[1]).toBe('2,short,5');
    expect(text).toContain(CUT_NOTE);
  });

  it('keeps every value of a long tab-separated row, cutting only the long one', async () => {
    const { rows } = await profileOf(`id\tnote\tamount\n1\t${'x'.repeat(5_000)}\t42\n`, '\t');

    const fields = rows[0]!.split('\t');
    expect(fields).toHaveLength(3);
    expect(fields[1]!.endsWith('…')).toBe(true);
    expect(fields[2]).toBe('42');
  });

  it('keeps the leading values of a row with too many to show and says how many it leaves out', async () => {
    const values = Array.from({ length: 5_000 }, (_, index) => String(index + 1));
    const { text, rows } = await profileOf(`a,b\n${values.join(',')}\n`);

    const fields = splitDelimitedFields(rows[0]!, ',');
    expect(fields.slice(0, 3)).toEqual(['1', '2', '3']);
    const shown = fields.length - 1;
    expect(fields.at(-1)).toBe(`… (${5_000 - shown} more values not shown)`);
    expect(Buffer.byteLength(JSON.stringify(rows[0]), 'utf8')).toBeLessThanOrEqual(2048);
    expect(text).toContain(CUT_NOTE);
  });

  it('leaves a row within the bound as it was written and adds no note', async () => {
    const quoted = '1,"a, ""b"""';
    const { text, rows } = await profileOf(`id,note\n${quoted}\n2,plain\n`);

    expect(rows).toEqual([quoted, '2,plain']);
    expect(text).not.toContain(CUT_NOTE);
  });
});
