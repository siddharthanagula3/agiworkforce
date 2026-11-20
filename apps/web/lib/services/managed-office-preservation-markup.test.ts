import { createHash, randomBytes } from 'node:crypto';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { E2BExecutor } from '@/lib/e2b/types';

import { generateManagedOfficeFile } from './managed-office-file-service';
import {
  editManagedDocx,
  editManagedWorkbook,
  recalculateManagedWorkbook,
  renderManagedOfficeFile,
  verifyManagedOfficePackage,
} from './managed-office-preservation';

const MAIN_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_RELATIONSHIPS_NAMESPACE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function attachment(data: Buffer, mimeType: string, filename: string) {
  return { filename, mimeType, base64: data.toString('base64') };
}

async function readPart(data: Buffer, path: string): Promise<string> {
  return (await JSZip.loadAsync(data)).file(path)!.async('string');
}

const SHEET_BODY =
  '<dimension ref="A1:D4"/><cols><col min="1" max="1" width="12" customWidth="1"/></cols><sheetData>' +
  '<row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Plain &amp; simple</t></is></c><c r="C1" s="2"/><c r="D1"><v>7</v></c></row>' +
  '<row r="2"><c r="A2"><v>10</v></c><c r="B2"><v>20</v></c><c r="C2"><f>SUM(A2:B2)</f><v>30</v></c><c r="D2" t="str"><f>IF(A2&gt;5,"big","small")</f><v>big</v></c></row>' +
  '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><f>IF(A2&gt;5,1,0)</f><v>1</v></c></row>' +
  '<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve"> padded </t></is></c><c r="B4" s="3"/></row>' +
  '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>';

const CALCULATED_SHEET_BODY = SHEET_BODY.replace('<v>30</v>', '<v>31</v>').replace(
  '<v>big</v>',
  '<v>small</v>',
);

interface WorkbookOptions {
  sheetBody?: string;
  workbookTail?: string;
  sharedStrings?: string;
  extraParts?: Record<string, string>;
  compression?: 'DEFLATE' | 'STORE';
}

async function workbookPackage(options: WorkbookOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="office" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>${options.workbookTail ?? '<calcPr calcId="191029"/>'}</workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="sheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file(
    'xl/sharedStrings.xml',
    options.sharedStrings ??
      `<sst xmlns="${MAIN_NAMESPACE}" count="2" uniqueCount="2"><si><t>Label</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">Rich </t></r><r><t>text &amp; more</t></r></si></sst>`,
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="${MAIN_NAMESPACE}">${options.sheetBody ?? SHEET_BODY}</worksheet>`,
  );
  for (const [path, content] of Object.entries(options.extraParts ?? {})) zip.file(path, content);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: options.compression ?? 'DEFLATE',
  });
}

async function documentPackage(
  body: string,
  compression: 'DEFLATE' | 'STORE' = 'DEFLATE',
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="office" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression });
}

function editWorkbook(data: Buffer, edits: Parameters<typeof editManagedWorkbook>[0]['edits']) {
  return editManagedWorkbook({ filename: 'plan.xlsx', sha256: sha256(data), edits }, [
    attachment(data, XLSX_MIME, 'plan.xlsx'),
  ]);
}

function editDocument(
  data: Buffer,
  replacements: Parameters<typeof editManagedDocx>[0]['replacements'],
) {
  return editManagedDocx({ filename: 'brief.docx', sha256: sha256(data), replacements }, [
    attachment(data, DOCX_MIME, 'brief.docx'),
  ]);
}

function evaluator(calculatedSheetXml: string) {
  let staged = Buffer.alloc(0);
  const executor: E2BExecutor = {
    createFolder: async () => ({ ok: true, output: '' }),
    writeFile: async ({ content }) => {
      staged = Buffer.from(content, 'base64');
      return { ok: true, output: '' };
    },
    runCommand: async () => ({ ok: true, output: '', stdout: '', stderr: '', exitCode: 0 }),
    listFiles: async (directory) => [
      {
        path: `${directory}/input.xlsx`,
        name: 'input.xlsx',
        isDir: false,
        byteSize: staged.length,
      },
    ],
    readFileBytes: async () => {
      const zip = await JSZip.loadAsync(staged);
      zip.file(
        'xl/worksheets/sheet1.xml',
        `<worksheet xmlns="${MAIN_NAMESPACE}">${calculatedSheetXml}</worksheet>`,
      );
      return zip.generateAsync({ type: 'uint8array' });
    },
    runCode: async () => ({ ok: false, output: '', error: 'not used' }),
    dispose: async () => undefined,
  };
  return { executor, staged: () => staged };
}

describe('managed Office editing keeps its output for well-formed packages', () => {
  it('edits workbook cells of every kind', async () => {
    const data = await workbookPackage();
    const edited = await editWorkbook(data, [
      { sheet: 'Data', cell: 'B1', expected: 'Plain & simple', value: 'Changed <&>' },
      { sheet: 'Data', cell: 'A1', expected: 'Label', value: 42 },
      { sheet: 'Data', cell: 'C2', expected: '=SUM(A2:B2)', value: '=A2+B2' },
      { sheet: 'Data', cell: 'D1', expected: 7, value: 'text' },
      { sheet: 'Data', cell: 'B3', expected: 1, value: 0 },
      { sheet: 'Data', cell: 'A4', expected: ' padded ', value: ' ' },
      { sheet: 'Data', cell: 'B4', expected: 0, value: 5 },
    ]);
    expect(await readPart(edited.data, 'xl/worksheets/sheet1.xml')).toMatchInlineSnapshot(
      `"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D4"/><cols><col min="1" max="1" width="12" customWidth="1"/></cols><sheetData><row r="1" spans="1:4"><c r="A1"><v>42</v></c><c r="B1" t="inlineStr"><is><t xml:space="preserve">Changed &lt;&amp;&gt;</t></is></c><c r="C1" s="2"/><c r="D1" t="inlineStr"><is><t xml:space="preserve">text</t></is></c></row><row r="2"><c r="A2"><v>10</v></c><c r="B2"><v>20</v></c><c r="C2"><f>A2+B2</f></c><c r="D2" t="str"><f>IF(A2&gt;5,"big","small")</f><v>big</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>0</v></c><c r="C3"><f>IF(A2&gt;5,1,0)</f><v>1</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve"> </t></is></c><c r="B4" s="3"><v>5</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>"`,
    );
  });

  it('reads a rich shared string as the cell it replaces', async () => {
    const data = await workbookPackage();
    const edited = await editWorkbook(data, [
      { sheet: 'Data', cell: 'A3', expected: 'Rich text & more', value: 'plain' },
    ]);
    expect(await readPart(edited.data, 'xl/worksheets/sheet1.xml')).toContain(
      '<c r="A3" t="inlineStr"><is><t xml:space="preserve">plain</t></is></c>',
    );
  });

  it('replaces text across runs and leaves other runs as spelled', async () => {
    const data = await documentPackage(
      '<w:p><w:r><w:t>Hello &amp; welcome to ACME</w:t></w:r><w:r><w:t xml:space="preserve"> and ACME again</w:t></w:r><w:r><w:t/></w:r></w:p>' +
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell ACME</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
        '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold </w:t></w:r><w:r><w:t>It&#8217;s kept</w:t></w:r></w:p>',
    );
    const edited = await editDocument(data, [
      { find: 'ACME', replace: 'Globex <Inc>', expectedMatches: 3 },
      { find: 'Bold', replace: 'Strong', expectedMatches: 1 },
    ]);
    expect(await readPart(edited.data, 'word/document.xml')).toMatchInlineSnapshot(
      `"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">Hello &amp; welcome to Globex &lt;Inc&gt;</w:t></w:r><w:r><w:t xml:space="preserve"> and Globex &lt;Inc&gt; again</w:t></w:r><w:r><w:t/></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">Cell Globex &lt;Inc&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Strong </w:t></w:r><w:r><w:t>It&#8217;s kept</w:t></w:r></w:p></w:body></w:document>"`,
    );
  });

  it('verifies a workbook whose formulas all have results', async () => {
    const data = await workbookPackage();
    const verification = await verifyManagedOfficePackage(data, 'xlsx');
    expect({ ...verification, outputSha256: undefined }).toMatchInlineSnapshot(`
      {
        "outputSha256": undefined,
        "recalculation": "passed",
        "render": "not_run",
        "structural": "package_parts_checked",
      }
    `);
  });

  it.each([
    [
      'a formula without a result',
      SHEET_BODY.replace('<f>SUM(A2:B2)</f><v>30</v>', '<f>SUM(A2:B2)</f>'),
    ],
    ['a formula with an error result', SHEET_BODY.replace('<c r="C3"><f>', '<c r="C3" t="e"><f>')],
  ])('refuses a workbook with %s', async (_, sheetBody) => {
    const data = await workbookPackage({ sheetBody });
    await expect(verifyManagedOfficePackage(data, 'xlsx')).rejects.toThrow(
      'A workbook formula has no evaluated result or contains a calculation error.',
    );
  });

  it('recalculates a workbook and keeps the formulas', async () => {
    const { executor, staged } = evaluator(CALCULATED_SHEET_BODY);
    const delivered = await recalculateManagedWorkbook(await workbookPackage(), executor);
    expect({
      stagedWorkbook: await readPart(staged(), 'xl/workbook.xml'),
      stagedSheet: await readPart(staged(), 'xl/worksheets/sheet1.xml'),
      deliveredSheet: await readPart(delivered, 'xl/worksheets/sheet1.xml'),
      deliveredWorkbook: await readPart(delivered, 'xl/workbook.xml'),
    }).toMatchInlineSnapshot(`
      {
        "deliveredSheet": "<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D4"/><cols><col min="1" max="1" width="12" customWidth="1"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Plain &amp; simple</t></is></c><c r="C1" s="2"/><c r="D1"><v>7</v></c></row><row r="2"><c r="A2"><v>10</v></c><c r="B2"><v>20</v></c><c r="C2"><f>SUM(A2:B2)</f><v>31</v></c><c r="D2" t="str"><f>IF(A2&gt;5,"big","small")</f><v>small</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><f>IF(A2&gt;5,1,0)</f><v>1</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve"> padded </t></is></c><c r="B4" s="3"/></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>",
        "deliveredWorkbook": "<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>",
        "stagedSheet": "<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D4"/><cols><col min="1" max="1" width="12" customWidth="1"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Plain &amp; simple</t></is></c><c r="C1" s="2"/><c r="D1"><v>7</v></c></row><row r="2"><c r="A2"><v>10</v></c><c r="B2"><v>20</v></c><c r="C2"><f>SUM(A2:B2)</f></c><c r="D2" t="str"><f>IF(A2&gt;5,"big","small")</f></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><f>IF(A2&gt;5,1,0)</f></c></row><row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve"> padded </t></is></c><c r="B4" s="3"/></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>",
        "stagedWorkbook": "<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>",
      }
    `);
  });

  it('replaces a paired calculation setting', async () => {
    const { executor, staged } = evaluator(CALCULATED_SHEET_BODY);
    await recalculateManagedWorkbook(
      await workbookPackage({ workbookTail: '<calcPr calcId="1" iterate="1"></calcPr>' }),
      executor,
    );
    expect(await readPart(staged(), 'xl/workbook.xml')).toMatchInlineSnapshot(
      `"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>"`,
    );
  });

  it.each([
    ['an unsupported function', '<f>VLOOKUP(A1,B1:C2,2,FALSE)</f>'],
    ['an external reference', '<f>[1]Other!A1</f>'],
  ])('refuses to recalculate a formula with %s', async (_, formula) => {
    const { executor } = evaluator(CALCULATED_SHEET_BODY);
    const data = await workbookPackage({
      sheetBody: SHEET_BODY.replace('<f>SUM(A2:B2)</f>', formula),
    });
    await expect(recalculateManagedWorkbook(data, executor)).rejects.toThrow(/not supported/);
  });
});

const HOSTILE_PART_BYTES = 3 * 1024 * 1024;
const SCAN_TIME_BOUND_MS = 2_000;
const HOSTILE_TEST_TIMEOUT_MS = 60_000;

function hiddenInComment(unit: string, hostile: boolean): string {
  const shown = hostile ? unit : unit.replace(/</g, '_');
  const count = Math.ceil(HOSTILE_PART_BYTES / (shown.length + 7));
  return `<!--${Array.from({ length: count }, (_, index) => `${shown}${index} `).join('')}-->`;
}

interface HostileAndControl<T> {
  hostile: T;
  control: T;
}

async function hostileAndControl<T>(
  build: (hostile: boolean) => Promise<T>,
): Promise<HostileAndControl<T>> {
  return { hostile: await build(true), control: await build(false) };
}

async function elapsedMs(work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await work();
  return performance.now() - started;
}

async function scanTimeBeyondControl<I, T>(
  inputs: HostileAndControl<I>,
  work: (input: I) => Promise<T>,
): Promise<{ result: T; scanMs: number }> {
  const controlMs = await elapsedMs(() => work(inputs.control));
  let result: T | undefined;
  const hostileMs = await elapsedMs(async () => {
    result = await work(inputs.hostile);
  });
  return { result: result as T, scanMs: hostileMs - controlMs };
}

function outcome(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => 'delivered',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

const workspaceRefusingExecutor: E2BExecutor = {
  createFolder: async () => ({ ok: false, output: '' }),
  writeFile: async () => ({ ok: true, output: '' }),
  runCommand: async () => ({ ok: true, output: '', stdout: '', stderr: '', exitCode: 0 }),
  listFiles: async () => [],
  readFileBytes: async () => null,
  runCode: async () => ({ ok: false, output: '', error: 'not used' }),
  dispose: async () => undefined,
};

describe('managed Office processing runs in linear time on unterminated markup', () => {
  it(
    'verifies a workbook with cell openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookPackage({
          sheetBody: SHEET_BODY + hiddenInComment('<c ', hostile),
          compression: 'STORE',
        }),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        verifyManagedOfficePackage(data, 'xlsx'),
      );
      expect(result.recalculation).toBe('passed');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it.each<[string, (hostile: boolean) => WorkbookOptions]>([
    [
      'cell openings in a sheet',
      (hostile) => ({ sheetBody: SHEET_BODY + hiddenInComment('<c ', hostile) }),
    ],
    [
      'formula openings in a sheet',
      (hostile) => ({ sheetBody: SHEET_BODY + hiddenInComment('<f ', hostile) }),
    ],
    [
      'value openings after a cached value',
      (hostile) => ({
        sheetBody: SHEET_BODY.replace(
          '<f>SUM(A2:B2)</f><v>30</v>',
          `<f>SUM(A2:B2)</f><v>30</v>${hiddenInComment('<v ', hostile)}`,
        ),
      }),
    ],
    [
      'calculation setting openings in the workbook',
      (hostile) => ({
        workbookTail: `<calcPr calcId="1"/>${hiddenInComment('<calcPr ', hostile)}`,
      }),
    ],
    [
      'a formula made of one long name',
      (hostile) => ({
        sheetBody: SHEET_BODY.replace(
          '<f>SUM(A2:B2)</f>',
          `<f>${(hostile ? 'A' : '1').repeat(HOSTILE_PART_BYTES)}</f>`,
        ),
      }),
    ],
  ])(
    'recalculates a workbook with %s',
    async (_, options) => {
      const inputs = await hostileAndControl((hostile) =>
        workbookPackage({ ...options(hostile), compression: 'STORE' }),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor)),
      );
      expect(result).toBe('The workbook execution workspace could not be created.');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it.each<[string, (hostile: boolean) => WorkbookOptions]>([
    [
      'cell openings in a sheet',
      (hostile) => ({ sheetBody: SHEET_BODY + hiddenInComment('<c ', hostile) }),
    ],
    [
      'shared string openings',
      (hostile) => ({
        sharedStrings: `<sst xmlns="${MAIN_NAMESPACE}"><si><t>Label</t></si>${hiddenInComment('<si ', hostile)}</sst>`,
      }),
    ],
  ])(
    'edits a workbook with %s',
    async (_, options) => {
      const inputs = await hostileAndControl((hostile) =>
        workbookPackage({ ...options(hostile), compression: 'STORE' }),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        editWorkbook(data, [{ sheet: 'Data', cell: 'D1', expected: 7, value: 8 }]),
      );
      expect(await readPart(result.data, 'xl/worksheets/sheet1.xml')).toContain(
        '<c r="D1"><v>8</v></c>',
      );
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'edits a document with text run openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        documentPackage(
          `<w:p><w:r><w:t>Hello ACME</w:t></w:r></w:p>${hiddenInComment('<w:t ', hostile)}`,
          'STORE',
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        editDocument(data, [{ find: 'ACME', replace: 'Globex', expectedMatches: 1 }]),
      );
      expect(await readPart(result.data, 'word/document.xml')).toContain('Hello Globex');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

describe('managed Office processing runs in linear time at the request caps', () => {
  const ARRAY_ROWS = 120_000;
  const FILLER_RUNS = 200_000;
  const FILLER_ROWS = 150_000;

  it(
    'stages a workbook with many array formula results beside many plain cells',
    async () => {
      const inputs = await hostileAndControl((hostile) => {
        const rows: string[] = [];
        for (let row = 1; row <= ARRAY_ROWS; row += 1)
          rows.push(
            `<row r="${row}"><c r="A${row}">${hostile ? '<f t="array"/>' : '<v>12345</v>'}</c><c r="B${row}"/></row>`,
          );
        return workbookPackage({
          sheetBody: `<sheetData>${rows.join('')}</sheetData>`,
          compression: 'STORE',
        });
      });
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor)),
      );
      expect(result).toBe('The workbook execution workspace could not be created.');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'applies the largest allowed number of replacements in one pass over a long document',
    async () => {
      const keys = Array.from({ length: 100 }, (_, index) => `key${index}.`);
      const data = await documentPackage(
        `<w:p>${keys.map((key) => `<w:r><w:t>${key}</w:t></w:r>`).join('')}${Array.from(
          { length: FILLER_RUNS },
          (_, index) => `<w:r><w:t>${index.toString(36)}</w:t></w:r>`,
        ).join('')}</w:p>`,
        'STORE',
      );
      const replacements = keys.map((find, index) => ({
        find,
        replace: `value${index}.`,
        expectedMatches: 1,
      }));
      const { result, scanMs } = await scanTimeBeyondControl(
        { hostile: replacements, control: replacements.slice(0, 1) },
        (requested) => editDocument(data, requested),
      );
      const xml = await readPart(result.data, 'word/document.xml');
      expect(xml).toContain('<w:t xml:space="preserve">value99.</w:t>');
      expect(xml).not.toMatch(/key\d+\./);
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'applies the largest allowed number of cell edits in one pass over a long sheet',
    async () => {
      const rows: string[] = [];
      for (let row = 1; row <= FILLER_ROWS; row += 1)
        rows.push(
          row <= 1_000
            ? `<row r="${row}"><c r="A${row}"/><c r="B${row}"/></row>`
            : `<row r="${row}"><c r="B${row}"/></row>`,
        );
      const data = await workbookPackage({
        sheetBody: `<sheetData>${rows.join('')}</sheetData>`,
        compression: 'STORE',
      });
      const edits = Array.from({ length: 1_000 }, (_, index) => ({
        sheet: 'Data',
        cell: `A${index + 1}`,
        expected: 0,
        value: index + 1,
      }));
      const { result, scanMs } = await scanTimeBeyondControl(
        { hostile: edits, control: edits.slice(0, 1) },
        (requested) => editWorkbook(data, requested),
      );
      const sheet = await readPart(result.data, 'xl/worksheets/sheet1.xml');
      expect(sheet).toContain('<row r="1"><c r="A1"><v>1</v></c><c r="B1"/></row>');
      expect(sheet).toContain('<row r="1000"><c r="A1000"><v>1000</v></c><c r="B1000"/></row>');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

describe('managed Office processing reads markup the way an XML parser does', () => {
  it('edits one cell and keeps a neighbour after a closing tag with whitespace byte for byte', async () => {
    const data = await workbookPackage({
      sheetBody:
        '<sheetData><row r="1"><c r="A1"><v>1</v></c ><c r="B1" s="2"><v>2</v></c ></row></sheetData>',
    });
    const edited = await editWorkbook(data, [{ sheet: 'Data', cell: 'A1', expected: 1, value: 5 }]);
    expect(await readPart(edited.data, 'xl/worksheets/sheet1.xml')).toBe(
      `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><v>5</v></c><c r="B1" s="2"><v>2</v></c ></row></sheetData></worksheet>`,
    );
  });

  it('reads a cached value closed with whitespace as the current value', async () => {
    const data = await workbookPackage({
      sheetBody: '<sheetData><row r="1"><c r="A1"><v >7</v ></c></row></sheetData>',
    });
    const edited = await editWorkbook(data, [{ sheet: 'Data', cell: 'A1', expected: 7, value: 8 }]);
    expect(await readPart(edited.data, 'xl/worksheets/sheet1.xml')).toContain(
      '<c r="A1"><v>8</v></c>',
    );
  });

  it('refreshes the result of a formula cell closed with whitespace', async () => {
    const { executor } = evaluator(
      '<sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData>',
    );
    const delivered = await recalculateManagedWorkbook(
      await workbookPackage({
        sheetBody: '<sheetData><row r="1"><c r="A1"><f>1+1</f ><v>1</v></c ></row></sheetData>',
      }),
      executor,
    );
    expect(await readPart(delivered, 'xl/worksheets/sheet1.xml')).toContain(
      '<c r="A1"><f>1+1</f ><v>2</v></c >',
    );
  });

  it.each([
    ['a closing tag written with whitespace', '<f>WEBSERVICE("http://169.254.169.254/")</f >'],
    ['character data', '<f><![CDATA[WEBSERVICE("http://169.254.169.254/")]]></f>'],
    ['character data split by a comment', '<f>WEB<!-- -->SERVICE<![CDATA[(A1)]]></f>'],
  ])('refuses to recalculate an unsupported formula written with %s', async (_, formula) => {
    const data = await workbookPackage({
      sheetBody: `<sheetData><row r="1"><c r="A1">${formula}<v>1</v></c></row></sheetData>`,
    });
    await expect(recalculateManagedWorkbook(data, workspaceRefusingExecutor)).rejects.toThrow(
      /^(?:External workbook formulas|This workbook function) (?:are|is) not supported/,
    );
  });

  it('forces recalculation at the end of the workbook, not inside a comment', async () => {
    const { executor, staged } = evaluator(CALCULATED_SHEET_BODY);
    await recalculateManagedWorkbook(
      await workbookPackage({ workbookTail: '<calcPr calcId="1"/><!-- </workbook> -->' }),
      executor,
    );
    expect(await readPart(staged(), 'xl/workbook.xml')).toBe(
      `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets><!-- </workbook> --><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    );
  });

  it('refuses to recalculate a formula that holds an element', async () => {
    const data = await workbookPackage({
      sheetBody: '<sheetData><row r="1"><c r="A1"><f>1+<x/>2</f><v>3</v></c></row></sheetData>',
    });
    await expect(recalculateManagedWorkbook(data, workspaceRefusingExecutor)).rejects.toThrow(
      'A workbook formula contains markup the managed recalculation contract cannot check.',
    );
  });

  it('edits a document whose comment mentions an unclosed text run', async () => {
    const data = await documentPackage(
      '<!-- legacy <w:t> marker --><w:p><w:r><w:t>Hello ACME</w:t></w:r></w:p>',
    );
    const edited = await editDocument(data, [
      { find: 'ACME', replace: 'Globex', expectedMatches: 1 },
    ]);
    expect(await readPart(edited.data, 'word/document.xml')).toContain(
      '<!-- legacy <w:t> marker --><w:p><w:r><w:t xml:space="preserve">Hello Globex</w:t></w:r></w:p>',
    );
  });

  it('does not count text inside a comment or character data as a text run', async () => {
    const data = await documentPackage(
      '<w:p><!-- <w:t>ACME</w:t> --><w:r><w:t>ACME</w:t></w:r></w:p>',
    );
    await expect(
      editDocument(data, [{ find: 'ACME', replace: 'Globex', expectedMatches: 2 }]),
    ).rejects.toThrow('The text match count differs');
  });
});

describe('managed Office processing keeps array formula results', () => {
  const ARRAY_SHEET =
    '<sheetData><row r="1"><c r="A1"><f t="array" ref="A1:A2">B1*2</f><v>1</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>3</v></c></row></sheetData>';

  it('clears and refreshes every cell of an array result and nothing else', async () => {
    const { executor, staged } = evaluator(
      '<sheetData><row r="1"><c r="A1"><f t="array" ref="A1:A2">B1*2</f><v>4</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"><v>4</v></c><c r="B2"><v>3</v></c></row></sheetData>',
    );
    const delivered = await recalculateManagedWorkbook(
      await workbookPackage({ sheetBody: ARRAY_SHEET }),
      executor,
    );
    expect({
      staged: await readPart(staged(), 'xl/worksheets/sheet1.xml'),
      delivered: await readPart(delivered, 'xl/worksheets/sheet1.xml'),
    }).toEqual({
      staged: `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:A2">B1*2</f></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"></c><c r="B2"><v>3</v></c></row></sheetData></worksheet>`,
      delivered: `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:A2">B1*2</f><v>4</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"><v>4</v></c><c r="B2"><v>3</v></c></row></sheetData></worksheet>`,
    });
  });

  it.each(['A2', 'A1'])('refuses to edit %s inside an array result', async (cell) => {
    const data = await workbookPackage({ sheetBody: ARRAY_SHEET });
    await expect(
      editWorkbook(data, [
        { sheet: 'Data', cell: 'B2', expected: 3, value: 4 },
        { sheet: 'Data', cell, expected: 1, value: 2 },
      ]),
    ).rejects.toThrow('Shared, array and spill formula edits are unsupported.');
  });
});

describe('managed Office processing runs in linear time on a cell tag padded with spaces', () => {
  const PADDING = (() => {
    let state = 1;
    return Array.from({ length: 300_000 }, () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return ' \t\n'[(state >>> 16) % 3];
    }).join('');
  })();
  const PADDED_SHEET = (cell: string, hostile: boolean) =>
    hostile
      ? `<sheetData><row r="1">${cell.replace('<c ', `<c${PADDING}`)}</row></sheetData>`
      : `<sheetData><row r="1">${PADDING}${cell}</row></sheetData>`;

  it(
    'recalculates a workbook whose formula cell tag is padded',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookPackage({
          sheetBody: PADDED_SHEET('<c r="A1" t="n"><f>1+1</f><v>1</v></c>', hostile),
          compression: 'STORE',
        }),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        recalculateManagedWorkbook(
          data,
          evaluator('<sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData>')
            .executor,
        ),
      );
      expect(await readPart(result, 'xl/worksheets/sheet1.xml')).toContain('<v>2</v>');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'edits a formula cell whose tag is padded and keeps its other attributes',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookPackage({
          sheetBody: PADDED_SHEET('<c r="A1" s="4" t="str"><f>1+1</f><v>2</v></c>', hostile),
          compression: 'STORE',
        }),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (data) =>
        editWorkbook(data, [{ sheet: 'Data', cell: 'A1', expected: '=1+1', value: 3 }]),
      );
      expect(await readPart(result.data, 'xl/worksheets/sheet1.xml')).toContain(
        `<c${PADDING}r="A1" s="4"><v>3</v></c>`,
      );
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

const METADATA_URL_CALL = 'WEBSERVICE(&quot;http://169.254.169.254/&quot;)';
const X14_NAMESPACE = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
const XM_NAMESPACE = 'http://schemas.microsoft.com/office/excel/2006/main';

function x14DataValidation(formula1: string): string {
  return `<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="${X14_NAMESPACE}"><x14:dataValidations count="1" xmlns:xm="${XM_NAMESPACE}"><x14:dataValidation type="list"><x14:formula1>${formula1}</x14:formula1><xm:sqref>A1</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst>`;
}

describe('managed recalculation checks every formula the evaluator can read', () => {
  it.each<[string, WorkbookOptions, string | RegExp]>([
    [
      'a worksheet stored outside the worksheets folder',
      {
        extraParts: {
          'xl/workbook.xml': `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>`,
          'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="sheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="sheet" Target="other/sheet2.xml"/></Relationships>`,
          'xl/other/sheet2.xml': `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><f>${METADATA_URL_CALL}</f></c></row></sheetData></worksheet>`,
        },
      },
      /not supported/,
    ],
    [
      'a conditional formatting rule',
      {
        sheetBody: `${SHEET_BODY}<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1"><formula>${METADATA_URL_CALL}</formula></cfRule></conditionalFormatting>`,
      },
      /not supported/,
    ],
    [
      'a data validation rule',
      {
        sheetBody: `${SHEET_BODY}<dataValidations count="1"><dataValidation type="custom" sqref="A1"><formula1>${METADATA_URL_CALL}</formula1></dataValidation></dataValidations>`,
      },
      /not supported/,
    ],
    [
      'an extension data validation rule',
      { sheetBody: SHEET_BODY + x14DataValidation(`<xm:f>${METADATA_URL_CALL}</xm:f>`) },
      /not supported/,
    ],
    [
      'text beside an extension formula',
      { sheetBody: SHEET_BODY + x14DataValidation('WEBSERVICE<xm:f>A1</xm:f>("x")') },
      'A workbook formula contains markup the managed recalculation contract cannot check.',
    ],
    [
      'a table calculated column',
      {
        extraParts: {
          'xl/tables/table1.xml': `<table xmlns="${MAIN_NAMESPACE}" id="1" name="T" displayName="T" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="C"><calculatedColumnFormula>${METADATA_URL_CALL}</calculatedColumnFormula></tableColumn></tableColumns></table>`,
        },
      },
      /not supported/,
    ],
    [
      'a pivot cache calculated field',
      {
        extraParts: {
          'xl/pivotCache/pivotCacheDefinition1.xml': `<pivotCacheDefinition xmlns="${MAIN_NAMESPACE}"><cacheFields count="1"><cacheField name="F" numFmtId="0" formula="${METADATA_URL_CALL}"/></cacheFields></pivotCacheDefinition>`,
        },
      },
      /not supported/,
    ],
    [
      'a prefixed defined name',
      {
        extraParts: {
          'xl/workbook.xml': `<x:workbook xmlns:x="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><x:sheets><x:sheet name="Data" sheetId="1" r:id="rId1"/></x:sheets><x:definedNames><x:definedName name="n">${METADATA_URL_CALL}</x:definedName></x:definedNames></x:workbook>`,
        },
      },
      /not supported/,
    ],
    [
      'an external link written with spaces around its equals sign',
      {
        extraParts: {
          'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="hyperlink" Target="http://169.254.169.254/" TargetMode = "External"/></Relationships>`,
        },
      },
      'External workbook links are not supported during recalculation.',
    ],
  ])('refuses to recalculate a workbook with %s', async (_, options, refusal) => {
    const data = await workbookPackage(options);
    const result = await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor));
    if (typeof refusal === 'string') expect(result).toBe(refusal);
    else expect(result).toMatch(refusal);
  });

  it('refuses to render a workbook whose external link has spaces around its equals sign', async () => {
    const data = await workbookPackage({
      extraParts: {
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="hyperlink" Target="http://169.254.169.254/" TargetMode = "External"/></Relationships>`,
      },
    });
    expect(await outcome(renderManagedOfficeFile(data, 'xlsx', workspaceRefusingExecutor))).toBe(
      'External document links must be removed before managed rendering.',
    );
  });

  it.each<[string, WorkbookOptions]>([
    [
      'a conditional formatting comparison',
      {
        sheetBody: `${SHEET_BODY}<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1"><formula>A1&gt;5</formula></cfRule></conditionalFormatting>`,
      },
    ],
    [
      'an extension list validation',
      { sheetBody: SHEET_BODY + x14DataValidation('<xm:f>"Yes,No"</xm:f>') },
    ],
    [
      'a chart series reference',
      {
        extraParts: {
          'xl/charts/chart1.xml': `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:val><c:numRef><c:f>Data!$A$2:$B$2</c:f></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`,
        },
      },
    ],
  ])('stages a workbook with %s for recalculation', async (_, options) => {
    const data = await workbookPackage(options);
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      'The workbook execution workspace could not be created.',
    );
  });
});

describe('managed Office processing reads attributes the way an XML parser does', () => {
  it.each([
    ['spaces around its equals sign', '<c r="A1" t = "s"><v>0</v></c>', '<c r="A1"><v>5</v></c>'],
    ['a character reference', '<c r="A1" t="&#115;"><v>0</v></c>', '<c r="A1"><v>5</v></c>'],
    [
      'a closing bracket in an earlier attribute',
      '<c r="A1" s="1" note="a>b" t="s"><v>0</v></c>',
      '<c r="A1" s="1" note="a>b"><v>5</v></c>',
    ],
  ])('reads a shared string type written with %s', async (_, cell, edited) => {
    const data = await workbookPackage({
      sheetBody: `<sheetData><row r="1">${cell}</row></sheetData>`,
    });
    const result = await editWorkbook(data, [
      { sheet: 'Data', cell: 'A1', expected: 'Label', value: 5 },
    ]);
    expect(await readPart(result.data, 'xl/worksheets/sheet1.xml')).toContain(
      `<row r="1">${edited}</row>`,
    );
  });

  it('finds a cell whose address is written with spaces around its equals sign', async () => {
    const data = await workbookPackage({
      sheetBody: '<sheetData><row r="1"><c r = "B1"><v>1</v></c></row></sheetData>',
    });
    const result = await editWorkbook(data, [{ sheet: 'Data', cell: 'B1', expected: 1, value: 2 }]);
    expect(await readPart(result.data, 'xl/worksheets/sheet1.xml')).toContain(
      '<c r = "B1"><v>2</v></c>',
    );
  });

  it.each([
    [
      'a shared formula',
      '<row r="1"><c r="A1"><f t = "shared" ref = "A1:A2" si = "0">B1*2</f><v>2</v></c><c r="B1"><v>1</v></c></row>',
      'A1',
      '=B1*2',
    ],
    [
      'an array formula result',
      '<row r="1"><c r="A1"><f t = "array" ref = "A1:A2">B1*2</f><v>2</v></c><c r="B1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>',
      'A2',
      2,
    ],
  ])(
    'refuses to edit %s whose attributes have spaces around their equals signs',
    async (_, rows, cell, expected) => {
      const data = await workbookPackage({ sheetBody: `<sheetData>${rows}</sheetData>` });
      await expect(
        editWorkbook(data, [{ sheet: 'Data', cell, expected, value: 7 }]),
      ).rejects.toThrow('Shared, array and spill formula edits are unsupported.');
    },
  );

  it('refuses a formula error result written with spaces around its equals sign', async () => {
    const data = await workbookPackage({
      sheetBody: SHEET_BODY.replace('<c r="C3"><f>', '<c r="C3" t = "e"><f>'),
    });
    await expect(verifyManagedOfficePackage(data, 'xlsx')).rejects.toThrow(
      'A workbook formula has no evaluated result or contains a calculation error.',
    );
  });

  it('keeps the text type of an evaluated result written with spaces around its equals sign', async () => {
    const { executor } = evaluator(
      '<sheetData><row r="1"><c r="A1" t = "str"><f>IF(1,"a","b")</f><v>a</v></c></row></sheetData>',
    );
    const delivered = await recalculateManagedWorkbook(
      await workbookPackage({
        sheetBody: '<sheetData><row r="1"><c r="A1"><f>IF(1,"a","b")</f></c></row></sheetData>',
      }),
      executor,
    );
    expect(await readPart(delivered, 'xl/worksheets/sheet1.xml')).toContain(
      '<c r="A1" t="str"><f>IF(1,"a","b")</f><v>a</v></c>',
    );
  });

  it('keeps a preserved space setting written with spaces around its equals sign', async () => {
    const data = await documentPackage(
      '<w:p><w:r><w:t xml:space = "preserve">Hello ACME </w:t></w:r></w:p>',
    );
    const edited = await editDocument(data, [
      { find: 'ACME', replace: 'Globex', expectedMatches: 1 },
    ]);
    expect(await readPart(edited.data, 'word/document.xml')).toContain(
      '<w:t xml:space = "preserve">Hello Globex </w:t>',
    );
  });
});

describe('managed Office processing reads empty elements as empty', () => {
  it('counts a shared string that is an empty element as its own entry', async () => {
    const data = await workbookPackage({
      sharedStrings: `<sst xmlns="${MAIN_NAMESPACE}"><si/><si><t>Second</t></si></sst>`,
      sheetBody: '<sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData>',
    });
    const edited = await editWorkbook(data, [
      { sheet: 'Data', cell: 'A1', expected: 'Second', value: 'Changed' },
    ]);
    expect(await readPart(edited.data, 'xl/worksheets/sheet1.xml')).toContain('Changed');
  });
});

const STAGED_FOR_RECALCULATION = 'The workbook execution workspace could not be created.';
const STAGED_FOR_RENDERING = 'The rendering workspace could not be created.';
const UNCHECKABLE_PART =
  'The workbook contains a part the managed recalculation contract cannot check.';
const IMAGE_RELATIONSHIP = `${OFFICE_RELATIONSHIPS_NAMESPACE}/image`;
const WORKSHEET_RELATIONSHIP = `${OFFICE_RELATIONSHIPS_NAMESPACE}/worksheet`;

function conditionalFormatting(rule: string): string {
  return `${SHEET_BODY}<conditionalFormatting sqref="A1:A9">${rule}</conditionalFormatting>`;
}

function expressionRule(type: string, formula: string, attributes = ''): string {
  return conditionalFormatting(
    `<cfRule type="${type}" dxfId="0" priority="1"${attributes}><formula>${formula}</formula></cfRule>`,
  );
}

function dateOccurringRule(period: string, formula: string): string {
  return expressionRule('timePeriod', formula, ` timePeriod="${period}"`);
}

function dataValidation(type: string, formulas: string, attributes = ''): string {
  return `${SHEET_BODY}<dataValidations count="1"><dataValidation type="${type}" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="A1:A9"${attributes}>${formulas}</dataValidation></dataValidations>`;
}

function x14ConditionalFormatting(rule: string): string {
  return `${SHEET_BODY}<extLst><ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="${X14_NAMESPACE}"><x14:conditionalFormattings><x14:conditionalFormatting xmlns:xm="${XM_NAMESPACE}">${rule}<xm:sqref>A1:A9</xm:sqref></x14:conditionalFormatting></x14:conditionalFormattings></ext></extLst>`;
}

describe('managed recalculation accepts the formulas of Excel built-in rules', () => {
  it.each<[string, string]>([
    [
      'Highlight Cells Greater Than',
      conditionalFormatting(
        '<cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>5</formula></cfRule>',
      ),
    ],
    [
      'Highlight Cells Between',
      conditionalFormatting(
        '<cfRule type="cellIs" dxfId="0" priority="1" operator="between"><formula>1</formula><formula>10</formula></cfRule>',
      ),
    ],
    [
      'Highlight Cells Text that Contains',
      expressionRule(
        'containsText',
        'NOT(ISERROR(SEARCH("ok",A1)))',
        ' operator="containsText" text="ok"',
      ),
    ],
    [
      'Highlight Cells Text that Does Not Contain',
      expressionRule(
        'notContainsText',
        'ISERROR(SEARCH("ok",A1))',
        ' operator="notContains" text="ok"',
      ),
    ],
    [
      'Highlight Cells Begins With',
      expressionRule('beginsWith', 'LEFT(A1,LEN("ok"))="ok"', ' operator="beginsWith" text="ok"'),
    ],
    [
      'Highlight Cells Ends With',
      expressionRule('endsWith', 'RIGHT(A1,LEN("ok"))="ok"', ' operator="endsWith" text="ok"'),
    ],
    ['Highlight Cells Blanks', expressionRule('containsBlanks', 'LEN(TRIM(A1))=0')],
    ['Highlight Cells No Blanks', expressionRule('notContainsBlanks', 'LEN(TRIM(A1))&gt;0')],
    ['Highlight Cells Errors', expressionRule('containsErrors', 'ISERROR(A1)')],
    ['Highlight Cells No Errors', expressionRule('notContainsErrors', 'NOT(ISERROR(A1))')],
    [
      'Highlight Cells Duplicate Values',
      conditionalFormatting('<cfRule type="duplicateValues" dxfId="0" priority="1"/>'),
    ],
    [
      'Top 10 Items',
      conditionalFormatting('<cfRule type="top10" dxfId="0" priority="1" rank="10"/>'),
    ],
    [
      'Bottom 10 Percent',
      conditionalFormatting(
        '<cfRule type="top10" dxfId="0" priority="1" percent="1" bottom="1" rank="10"/>',
      ),
    ],
    [
      'Above Average',
      conditionalFormatting('<cfRule type="aboveAverage" dxfId="0" priority="1"/>'),
    ],
    [
      'Below Average',
      conditionalFormatting(
        '<cfRule type="aboveAverage" dxfId="0" priority="1" aboveAverage="0"/>',
      ),
    ],
    ['A Date Occurring Yesterday', dateOccurringRule('yesterday', 'FLOOR(A1,1)=TODAY()-1')],
    ['A Date Occurring Today', dateOccurringRule('today', 'FLOOR(A1,1)=TODAY()')],
    ['A Date Occurring Tomorrow', dateOccurringRule('tomorrow', 'FLOOR(A1,1)=TODAY()+1')],
    [
      'A Date Occurring In the Last 7 Days',
      dateOccurringRule('last7Days', 'AND(TODAY()-FLOOR(A1,1)&lt;=6,FLOOR(A1,1)&lt;=TODAY())'),
    ],
    [
      'A Date Occurring Last Week',
      dateOccurringRule(
        'lastWeek',
        'AND(TODAY()-ROUNDDOWN(A1,0)&gt;=(WEEKDAY(TODAY())),TODAY()-ROUNDDOWN(A1,0)&lt;(WEEKDAY(TODAY())+7))',
      ),
    ],
    [
      'A Date Occurring This Week',
      dateOccurringRule(
        'thisWeek',
        'AND(TODAY()-ROUNDDOWN(A1,0)&lt;=WEEKDAY(TODAY())-1,ROUNDDOWN(A1,0)-TODAY()&lt;=7-WEEKDAY(TODAY()))',
      ),
    ],
    [
      'A Date Occurring Next Week',
      dateOccurringRule(
        'nextWeek',
        'AND(ROUNDDOWN(A1,0)-TODAY()&gt;(7-WEEKDAY(TODAY())),ROUNDDOWN(A1,0)-TODAY()&lt;(15-WEEKDAY(TODAY())))',
      ),
    ],
    [
      'A Date Occurring Last Month',
      dateOccurringRule(
        'lastMonth',
        'AND(MONTH(A1)=MONTH(EDATE(TODAY(),0-1)),YEAR(A1)=YEAR(EDATE(TODAY(),0-1)))',
      ),
    ],
    [
      'A Date Occurring This Month',
      dateOccurringRule('thisMonth', 'AND(MONTH(A1)=MONTH(TODAY()),YEAR(A1)=YEAR(TODAY()))'),
    ],
    [
      'A Date Occurring Next Month',
      dateOccurringRule(
        'nextMonth',
        'AND(MONTH(A1)=MONTH(EDATE(TODAY(),0+1)),YEAR(A1)=YEAR(EDATE(TODAY(),0+1)))',
      ),
    ],
    [
      'a three-color scale',
      conditionalFormatting(
        '<cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/><color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale></cfRule>',
      ),
    ],
    [
      'a data bar with its extension',
      x14ConditionalFormatting(
        '<x14:cfRule type="dataBar" id="{00000000-0000-0000-0000-000000000001}"><x14:dataBar minLength="0" maxLength="100"><x14:cfvo type="autoMin"/><x14:cfvo type="formula"><xm:f>$B$1</xm:f></x14:cfvo></x14:dataBar></x14:cfRule>',
      ),
    ],
    [
      'a list validation from typed items',
      dataValidation('list', '<formula1>"Yes,No,Maybe"</formula1>'),
    ],
    ['a list validation from a range', dataValidation('list', '<formula1>$D$1:$D$4</formula1>')],
    [
      'a list validation from another sheet',
      SHEET_BODY + x14DataValidation('<xm:f>Data!$A$1:$A$3</xm:f>'),
    ],
    [
      'a whole number validation between two bounds',
      dataValidation('whole', '<formula1>1</formula1><formula2>10</formula2>'),
    ],
    [
      'a decimal validation',
      dataValidation('decimal', '<formula1>0.5</formula1>', ' operator="greaterThan"'),
    ],
    [
      'a date validation from today',
      dataValidation('date', '<formula1>TODAY()</formula1>', ' operator="greaterThanOrEqual"'),
    ],
    [
      'a date validation between two dates',
      dataValidation('date', '<formula1>DATE(2026,1,1)</formula1><formula2>46387</formula2>'),
    ],
    [
      'a text length validation',
      dataValidation('textLength', '<formula1>20</formula1>', ' operator="lessThanOrEqual"'),
    ],
    ['a custom number validation', dataValidation('custom', '<formula1>ISNUMBER(A1)</formula1>')],
    [
      'a custom unique entry validation',
      dataValidation('custom', '<formula1>COUNTIF($A$1:$A$9,A1)=1</formula1>'),
    ],
  ])('stages a workbook with %s for recalculation', async (_, sheetBody) => {
    const data = await workbookPackage({ sheetBody });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RECALCULATION,
    );
  });

  const REACHING_FUNCTIONS = [
    'WEBSERVICE(A1)',
    'FILTERXML(A1,"//a")',
    'HYPERLINK(A1)',
    'INDIRECT(A1)',
    'OFFSET(A1,0,0)',
    'INFO("directory")',
    'CELL("filename",A1)',
    'RTD("p",,"t")',
    'CALL(A1)',
    'DDE(A1)',
    'IMAGE(A1)',
  ];
  const RULE_CARRIERS: [string, (formula: string) => string][] = [
    ['a conditional formatting rule', (formula) => expressionRule('expression', formula)],
    [
      'a conditional formatting threshold',
      (formula) =>
        conditionalFormatting(
          `<cfRule type="colorScale" priority="1"><colorScale><cfvo type="formula" val="${formula.replace(/"/g, '&quot;')}"/><cfvo type="max"/><color rgb="FFF8696B"/><color rgb="FF63BE7B"/></colorScale></cfRule>`,
        ),
    ],
    [
      'an extension conditional formatting rule',
      (formula) =>
        x14ConditionalFormatting(
          `<x14:cfRule type="expression" priority="1" id="{00000000-0000-0000-0000-000000000002}"><xm:f>${formula}</xm:f></x14:cfRule>`,
        ),
    ],
    [
      'an extension conditional formatting threshold',
      (formula) =>
        x14ConditionalFormatting(
          `<x14:cfRule type="dataBar" id="{00000000-0000-0000-0000-000000000003}"><x14:dataBar><x14:cfvo type="formula"><xm:f>${formula}</xm:f></x14:cfvo><x14:cfvo type="autoMax"/></x14:dataBar></x14:cfRule>`,
        ),
    ],
    [
      'a data validation lower bound',
      (formula) => dataValidation('custom', `<formula1>${formula}</formula1>`),
    ],
    [
      'a data validation upper bound',
      (formula) => dataValidation('whole', `<formula1>1</formula1><formula2>${formula}</formula2>`),
    ],
    [
      'an extension data validation',
      (formula) => SHEET_BODY + x14DataValidation(`<xm:f>${formula}</xm:f>`),
    ],
  ];

  it.each(
    RULE_CARRIERS.flatMap(([carrier, sheetBody]) =>
      REACHING_FUNCTIONS.map((formula): [string, string, string] => [
        formula,
        carrier,
        sheetBody(formula),
      ]),
    ),
  )('refuses %s in %s', async (_, __, sheetBody) => {
    const data = await workbookPackage({ sheetBody });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      'This workbook function is not supported by the managed recalculation contract.',
    );
  });

  it('keeps the narrower list for cell formulas', async () => {
    const data = await workbookPackage({
      sheetBody: SHEET_BODY.replace('<f>SUM(A2:B2)</f>', '<f>ISERROR(SEARCH("a",A1))</f>'),
    });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      'This workbook function is not supported by the managed recalculation contract.',
    );
  });
});

function workbookWithSecondSheet(
  target: string,
  part: string,
  content: string,
  extraParts: Record<string, string> = {},
): Promise<Buffer> {
  return workbookPackage({
    extraParts: {
      'xl/workbook.xml': `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${WORKSHEET_RELATIONSHIP}" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${WORKSHEET_RELATIONSHIP}" Target="${target}"/></Relationships>`,
      [part]: content,
      ...extraParts,
    },
  });
}

const REACHING_SHEET = `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><f>WEBSERVICE(A2)</f></c></row></sheetData></worksheet>`;
const IMAGE_BYTES = '\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR';

function contentTypes(entries: string): string {
  return `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${entries}</Types>`;
}

describe('managed recalculation chooses the parts it checks by kind, not by name', () => {
  it.each<[string, () => Promise<Buffer>, string]>([
    [
      'a worksheet whose part name ends in an upper-case extension',
      () => workbookWithSecondSheet('other/sheet2.XML', 'xl/other/sheet2.XML', REACHING_SHEET),
      'This workbook function is not supported by the managed recalculation contract.',
    ],
    [
      'a worksheet whose part name has no extension',
      () => workbookWithSecondSheet('other/sheet2', 'xl/other/sheet2', REACHING_SHEET),
      'This workbook function is not supported by the managed recalculation contract.',
    ],
    [
      'a worksheet declared as an image',
      () =>
        workbookWithSecondSheet('media/sheet2.png', 'xl/media/sheet2.png', REACHING_SHEET, {
          '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        }),
      'This workbook function is not supported by the managed recalculation contract.',
    ],
    [
      'a worksheet stored as a binary record part',
      () =>
        workbookWithSecondSheet(
          'worksheets/sheet2.bin',
          'xl/worksheets/sheet2.bin',
          REACHING_SHEET,
        ),
      UNCHECKABLE_PART,
    ],
    [
      'a worksheet relationship to bytes that are not XML',
      () =>
        workbookWithSecondSheet('media/sheet2.png', 'xl/media/sheet2.png', IMAGE_BYTES, {
          '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        }),
      UNCHECKABLE_PART,
    ],
    [
      'a part of no declared kind that is not XML',
      () => workbookPackage({ extraParts: { 'xl/customProperty1.bin': IMAGE_BYTES } }),
      UNCHECKABLE_PART,
    ],
  ])('refuses to recalculate %s', async (_, build, refusal) => {
    expect(
      await outcome(recalculateManagedWorkbook(await build(), workspaceRefusingExecutor)),
    ).toBe(refusal);
  });

  it('stages a workbook with an image, printer settings and a legacy drawing', async () => {
    const data = await workbookPackage({
      extraParts: {
        '[Content_Types].xml': contentTypes(
          '<Default Extension="PNG" ContentType="image/png"/><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>',
        ),
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="../media/image1.PNG"/><Relationship Id="rId2" Type="${OFFICE_RELATIONSHIPS_NAMESPACE}/printerSettings" Target="../printerSettings/printerSettings1.bin"/><Relationship Id="rId3" Type="${OFFICE_RELATIONSHIPS_NAMESPACE}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/></Relationships>`,
        'xl/media/image1.PNG': IMAGE_BYTES,
        'xl/printerSettings/printerSettings1.bin': '\u0000\u0001\u0002\u0003',
        'xl/drawings/vmlDrawing1.vml':
          '<xml xmlns:v="urn:schemas-microsoft-com:vml"><v:shape><br></v:shape></xml>',
      },
    });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RECALCULATION,
    );
  });
});

describe('managed rendering checks workbook formulas before the engine reads them', () => {
  it.each<[string, () => Promise<Buffer>]>([
    [
      'a conditional formatting rule',
      () => workbookPackage({ sheetBody: expressionRule('expression', 'WEBSERVICE(A1)') }),
    ],
    [
      'a data validation rule',
      () =>
        workbookPackage({
          sheetBody: dataValidation('custom', '<formula1>WEBSERVICE(A1)</formula1>'),
        }),
    ],
    [
      'a worksheet whose part name ends in an upper-case extension',
      () => workbookWithSecondSheet('other/sheet2.XML', 'xl/other/sheet2.XML', REACHING_SHEET),
    ],
  ])('refuses to render a workbook whose only reaching formula is in %s', async (_, build) => {
    expect(
      await outcome(renderManagedOfficeFile(await build(), 'xlsx', workspaceRefusingExecutor)),
    ).toBe('This workbook function is not supported by the managed recalculation contract.');
  });

  it('stages a workbook with an Excel built-in rule for rendering', async () => {
    const data = await workbookPackage({
      sheetBody: expressionRule(
        'containsText',
        'NOT(ISERROR(SEARCH("ok",A1)))',
        ' operator="containsText" text="ok"',
      ),
    });
    expect(await outcome(renderManagedOfficeFile(data, 'xlsx', workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RENDERING,
    );
  });
});

function field(...instructions: string[]): string {
  return `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>${instructions
    .map(
      (instruction) => `<w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>`,
    )
    .join(
      '',
    )}<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

describe('managed rendering reads field instructions the way the word processor does', () => {
  it.each<[string, string]>([
    ['an instruction in character data', field('<![CDATA[INCLUDETEXT "file:///etc/hostname"]]>')],
    ['an instruction split across runs', field('INCLUDE', 'TEXT "file:///etc/hostname"')],
    [
      'an instruction split between text and character data',
      field('INCLU<![CDATA[DETEXT]]> "file:///etc/hostname"'),
    ],
    ['an instruction split by a comment', field('DD<!-- -->EAUTO "cmd" "x"')],
    ['an instruction after a field ending in a word', field('PAGE') + field('DDE "cmd" "x"')],
  ])('refuses to render a document with %s', async (_, body) => {
    const data = await documentPackage(body);
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      'Active document fields are unsupported during rendering.',
    );
  });

  it('stages a document with page number and hyperlink fields for rendering', async () => {
    const data = await documentPackage(
      field(' PAGE ', ' \\* MERGEFORMAT ') +
        field(' NUMPAGES ') +
        field(' HYPERLINK "https://example.com/" '),
    );
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RENDERING,
    );
  });

  async function documentWithParts(parts: Record<string, string>): Promise<Buffer> {
    const zip = await JSZip.loadAsync(await documentPackage('<w:p/>'));
    for (const [path, content] of Object.entries(parts)) zip.file(path, content);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('refuses to render a document whose main part is named without a lower-case extension', async () => {
    const data = await documentWithParts({
      '_rels/.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS_NAMESPACE}/officeDocument" Target="word/main.XML"/></Relationships>`,
      'word/main.XML': `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${field('INCLUDETEXT "file:///etc/hostname"')}</w:body></w:document>`,
    });
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      'Active document fields are unsupported during rendering.',
    );
  });

  it('refuses to render a document part of no declared kind that is not XML', async () => {
    const data = await documentWithParts({ 'word/settings.dat': IMAGE_BYTES });
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      'The document contains a part that cannot be checked before rendering.',
    );
  });

  it.each<[string, Record<string, unknown>]>([
    ['document', { format: 'docx', content: '# Plan\n\nPage text.' }],
    ['deck', { format: 'pptx', slides: [{ title: 'Plan', bullets: ['One', 'Two'] }] }],
    [
      'workbook',
      {
        format: 'xlsx',
        sheets: [
          {
            name: 'Budget',
            rows: [
              ['Item', 'Amount'],
              ['Tools', 25],
            ],
          },
        ],
      },
    ],
  ])('stages a generated %s for rendering', async (_, request) => {
    const generated = await generateManagedOfficeFile({
      ...request,
      filename: `plan.${String(request['format'])}`,
      title: 'Plan',
    });
    if (!generated.ok) throw new Error(generated.message);
    expect(
      await outcome(
        renderManagedOfficeFile(
          generated.data,
          request['format'] as 'docx' | 'pptx' | 'xlsx',
          workspaceRefusingExecutor,
        ),
      ),
    ).toBe(STAGED_FOR_RENDERING);
  });

  it('stages a document with an image and an embedded font for rendering', async () => {
    const data = await documentWithParts({
      '[Content_Types].xml': contentTypes(
        '<Default Extension="png" ContentType="image/png"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>',
      ),
      'word/_rels/document.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="media/image1.png"/></Relationships>`,
      'word/_rels/fontTable.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS_NAMESPACE}/font" Target="fonts/font1.odttf"/></Relationships>`,
      'word/fontTable.xml': `<w:fonts xmlns:w="${WORD_NAMESPACE}"/>`,
      'word/media/image1.png': IMAGE_BYTES,
      'word/fonts/font1.odttf': IMAGE_BYTES,
    });
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RENDERING,
    );
  });
});

describe('managed Word editing searches text in linear time', () => {
  const RUN_CHARACTERS = 6 * 1024 * 1024;
  const INCOMPRESSIBLE_BYTES = 128 * 1024;

  function periodicKey(split: number): string {
    return `${'a'.repeat(split)}b${'a'.repeat(1_999 - split)}`;
  }

  it(
    'replaces find strings built to defeat substring search in one long run',
    async () => {
      const keys = [999, 500, 1_500].map(periodicKey);
      const data = await documentPackage(
        `<w:p><w:r><w:t>${'a'.repeat(RUN_CHARACTERS)}${keys.join('')}marker</w:t></w:r></w:p><w:p><w:r><w:t>${randomBytes(INCOMPRESSIBLE_BYTES).toString('base64')}</w:t></w:r></w:p>`,
        'STORE',
      );
      const { result, scanMs } = await scanTimeBeyondControl(
        {
          hostile: keys.map((find, index) => ({
            find,
            replace: `key${index}`,
            expectedMatches: 1,
          })),
          control: [{ find: 'marker', replace: 'done', expectedMatches: 1 }],
        },
        (requested) => editDocument(data, requested),
      );
      const xml = await readPart(result.data, 'word/document.xml');
      expect(xml).toContain('key0key1key2marker</w:t>');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it('counts and replaces matches without overlap, left to right', async () => {
    const data = await documentPackage('<w:p><w:r><w:t>aaaaa abab-aba</w:t></w:r></w:p>');
    const edited = await editDocument(data, [
      { find: 'aa', replace: 'x', expectedMatches: 2 },
      { find: 'aba', replace: 'y', expectedMatches: 2 },
    ]);
    expect(await readPart(edited.data, 'word/document.xml')).toContain(
      '<w:t xml:space="preserve">xxa yb-y</w:t>',
    );
    await expect(
      editDocument(data, [{ find: 'aa', replace: 'x', expectedMatches: 3 }]),
    ).rejects.toThrow(/match count differs/);
  });
});

const HARMLESS_SHEET = `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`;
const UNSUPPORTED_FUNCTION =
  'This workbook function is not supported by the managed recalculation contract.';
const UNCHECKABLE_FORMULA =
  'A workbook formula contains markup the managed recalculation contract cannot check.';

describe('managed Office checks the part the engine opens for an encoded relationship target', () => {
  it.each<[string, () => Promise<Buffer>, string]>([
    [
      'a worksheet whose target names it only once percent-decoded',
      () =>
        workbookWithSecondSheet('worksheets/s%32.png', 'xl/worksheets/s%32.png', REACHING_SHEET, {
          'xl/worksheets/s2.png': HARMLESS_SHEET,
          '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        }),
      UNSUPPORTED_FUNCTION,
    ],
    [
      'a worksheet whose encoded target another relationship names as an image',
      () =>
        workbookWithSecondSheet('worksheets/s%32.png', 'xl/worksheets/s%32.png', REACHING_SHEET, {
          'xl/worksheets/s2.png': HARMLESS_SHEET,
          'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="s%2532.png"/></Relationships>`,
          '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        }),
      UNSUPPORTED_FUNCTION,
    ],
    [
      'a worksheet named by its target in another letter case that another relationship names as an image',
      () =>
        workbookWithSecondSheet('worksheets/S2.png', 'xl/worksheets/S2.png', HARMLESS_SHEET, {
          'xl/worksheets/s2.png': REACHING_SHEET,
          'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="s2.png"/></Relationships>`,
          '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        }),
      UNSUPPORTED_FUNCTION,
    ],
    [
      'a worksheet whose target carries a fragment that another relationship names as an image',
      () =>
        workbookWithSecondSheet(
          'worksheets/s2.png#.png',
          'xl/worksheets/s2.png#.png',
          REACHING_SHEET,
          {
            'xl/worksheets/s2.png': HARMLESS_SHEET,
            'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="s2.png%23.png"/></Relationships>`,
            '[Content_Types].xml': contentTypes(
              '<Default Extension="png" ContentType="image/png"/>',
            ),
          },
        ),
      UNSUPPORTED_FUNCTION,
    ],
    [
      'an unrelated part declared as an image that holds a worksheet',
      () =>
        workbookPackage({
          extraParts: {
            'xl/media/orphan.png': REACHING_SHEET,
            '[Content_Types].xml': contentTypes(
              '<Default Extension="png" ContentType="image/png"/>',
            ),
          },
        }),
      UNSUPPORTED_FUNCTION,
    ],
  ])('refuses %s', async (_, build, refusal) => {
    const data = await build();
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      refusal,
    );
    expect(await outcome(renderManagedOfficeFile(data, 'xlsx', workspaceRefusingExecutor))).toBe(
      refusal === UNCHECKABLE_PART
        ? 'The document contains a part that cannot be checked before rendering.'
        : refusal,
    );
  });

  it('stages a workbook whose image target is percent-encoded', async () => {
    const data = await workbookPackage({
      extraParts: {
        '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/>'),
        'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="../media/my%20image.png"/></Relationships>`,
        'xl/media/my image.png': IMAGE_BYTES,
        'xl/media/unused.png': IMAGE_BYTES,
      },
    });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RECALCULATION,
    );
  });
});

describe('managed Office reads quoted names and text in formulas as data', () => {
  it.each(['Revenue (USD)', 'Sheet1 (2)', "Bob's (draft)"])(
    'renders a chart of the sheet %s',
    async (name) => {
      const result = await generateManagedOfficeFile(
        {
          format: 'xlsx',
          filename: 'chart.xlsx',
          title: 'Chart',
          verify_render: true,
          sheets: [
            {
              name,
              rows: [
                ['Item', 'Amount'],
                ['A', 1],
                ['B', 2],
              ],
              chart: {
                type: 'bar',
                title: 'Amounts',
                category_column: 'A',
                value_column: 'B',
                first_row: 2,
                last_row: 3,
              },
            },
          ],
        },
        { executor: async () => workspaceRefusingExecutor },
      );
      expect(result).toMatchObject({ ok: false, message: STAGED_FOR_RENDERING });
    },
  );

  it.each([
    ['a parenthesis inside searched text', 'NOT(ISERROR(SEARCH("a(b",A1)))'],
    ['an escaped quote before a parenthesis', 'A1="say ""hi("""'],
    ['a quoted sheet name with an escaped apostrophe', "'Bob''s (draft)'!A1&gt;0"],
    ['a range between quoted sheet names', "SUM('Q1 (a)'!A1:A2)&gt;0"],
  ])('stages a rule with %s', async (_, formula) => {
    const data = await workbookPackage({ sheetBody: expressionRule('expression', formula) });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RECALCULATION,
    );
  });

  it.each([
    ['a call after a quoted sheet name', "'Q (1)'!A1+WEBSERVICE(A1)", UNSUPPORTED_FUNCTION],
    ['a call after text with an escaped quote', '"a""("&amp;WEBSERVICE(A1)', UNSUPPORTED_FUNCTION],
    [
      'a call inside a sheet name that is not a reference',
      "'a'WEBSERVICE(A1)",
      UNCHECKABLE_FORMULA,
    ],
    ['an apostrophe inside a name', "A'WEBSERVICE(A1)'!A1", UNCHECKABLE_FORMULA],
    ['a quotation mark inside a name', 'A"WEBSERVICE(A1)"', UNCHECKABLE_FORMULA],
    ['unterminated text', 'A1="WEBSERVICE(A1)', UNCHECKABLE_FORMULA],
    ['an unterminated sheet name', "'WEBSERVICE(A1)!A1", UNCHECKABLE_FORMULA],
  ])('refuses a rule with %s', async (_, formula, refusal) => {
    const data = await workbookPackage({ sheetBody: expressionRule('expression', formula) });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      refusal,
    );
  });
});

const VALUE_SHEET_BODY =
  '<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><v>4</v></c></row></sheetData><autoFilter ref="A1:B2"/>';
const EXCEL_DEFINED_NAMES =
  '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Data!$A$1:$B$2</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">Data!$A$1:$B$2,Data!$D$1:$E$2</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">\'Data\'!$A:$A,\'Data\'!$1:$1</definedName><definedName name="Rate">0.2</definedName></definedNames><calcPr calcId="191029"/>';

describe('managed Office checks named workbook expressions with the cell list', () => {
  it('renders an edited workbook with an AutoFilter, print settings and a named constant', async () => {
    const data = await workbookPackage({
      sheetBody: VALUE_SHEET_BODY,
      workbookTail: EXCEL_DEFINED_NAMES,
    });
    const result = await generateManagedOfficeFile(
      {
        format: 'xlsx',
        filename: 'plan.xlsx',
        title: 'Plan',
        verify_render: true,
        source: {
          filename: 'plan.xlsx',
          sha256: sha256(data),
          edits: [{ sheet: 'Data', cell: 'A2', expected: 3, value: 5 }],
        },
      },
      {
        attachments: [attachment(data, XLSX_MIME, 'plan.xlsx')],
        executor: async () => workspaceRefusingExecutor,
      },
    );
    expect(result).toMatchObject({ ok: false, message: STAGED_FOR_RENDERING });
  });

  it('recalculates a workbook with print settings and a named formula on the cell list', async () => {
    const data = await workbookPackage({
      workbookTail: EXCEL_DEFINED_NAMES.replace(
        '<definedName name="Rate">0.2</definedName>',
        '<definedName name="Total">SUM(Data!$A$2:$B$2)</definedName>',
      ),
    });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RECALCULATION,
    );
  });

  it.each([
    ['a function that reaches outside the workbook', 'WEBSERVICE(Data!$A$1)', UNSUPPORTED_FUNCTION],
    ['a rule-only function', 'ISERROR(Data!$A$1)', UNSUPPORTED_FUNCTION],
    ['a reference resolved from text', 'INDIRECT(&quot;Data!A1&quot;)', UNSUPPORTED_FUNCTION],
    ['an external workbook', '[1]Data!$A$1', 'External workbook formulas are not supported.'],
    ['an element', '<b>Data!$A$1</b>', UNCHECKABLE_FORMULA],
  ])('refuses to render or recalculate a name with %s', async (_, expression, refusal) => {
    const data = await workbookPackage({
      sheetBody: VALUE_SHEET_BODY,
      workbookTail: `<definedNames><definedName name="n">${expression}</definedName></definedNames>`,
    });
    expect(await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor))).toBe(
      refusal,
    );
    expect(await outcome(renderManagedOfficeFile(data, 'xlsx', workspaceRefusingExecutor))).toBe(
      refusal,
    );
  });
});

async function recalculationAndRenderOutcomes(data: Buffer): Promise<[string, string]> {
  return [
    await outcome(recalculateManagedWorkbook(data, workspaceRefusingExecutor)),
    await outcome(renderManagedOfficeFile(data, 'xlsx', workspaceRefusingExecutor)),
  ];
}

describe('managed Office reads a function stored with a future-function prefix by its name', () => {
  it.each(['_xlfn.IFNA(A2,0)', '_XLFN.IFNA(A2,0)', '_xlfn._xlws.SUM(A2:B2)', '_xlpm.SUM(A2:B2)'])(
    'recalculates and renders the cell formula %s',
    async (formula) => {
      const data = await workbookPackage({
        sheetBody: SHEET_BODY.replace('<f>SUM(A2:B2)</f>', `<f>${formula}</f>`),
      });
      expect(await recalculationAndRenderOutcomes(data)).toEqual([
        STAGED_FOR_RECALCULATION,
        STAGED_FOR_RENDERING,
      ]);
    },
  );

  it('recalculates and renders a rule that uses a prefixed function', async () => {
    const data = await workbookPackage({
      sheetBody: expressionRule('expression', '_xlfn.IFNA(A1,0)&gt;5'),
    });
    expect(await recalculationAndRenderOutcomes(data)).toEqual([
      STAGED_FOR_RECALCULATION,
      STAGED_FOR_RENDERING,
    ]);
  });

  it.each([
    '_xlfn.WEBSERVICE(A1)',
    '_xlfn._xlws.WEBSERVICE(A1)',
    '_xlpm._xlfn.INDIRECT(A1)',
    '_xlfn.ISERROR(A1)',
  ])('refuses the cell formula %s', async (formula) => {
    const data = await workbookPackage({
      sheetBody: SHEET_BODY.replace('<f>SUM(A2:B2)</f>', `<f>${formula}</f>`),
    });
    expect(await recalculationAndRenderOutcomes(data)).toEqual([
      UNSUPPORTED_FUNCTION,
      UNSUPPORTED_FUNCTION,
    ]);
  });
});

const OTHER_WORKBOOK = 'External workbook formulas are not supported.';

describe('managed Office refuses only a reference to another workbook', () => {
  function workbookWithName(expression: string, extraParts: Record<string, string> = {}) {
    return workbookPackage({
      sheetBody: VALUE_SHEET_BODY,
      workbookTail: `<definedNames><definedName name="n">${expression}</definedName></definedNames>`,
      extraParts,
    });
  }

  it.each([
    ['a table column', 'Table1[Item]'],
    ['a special item and a column', 'Table1[[#All],[Item]]'],
    ['the current row of a column', 'Table1[[#This Row],[Item]]'],
    ['a range of columns', 'SUM(Table1[[Item]:[Amount]])'],
    ['the whole table', 'COUNTA(Table1[])'],
    ['a column named by a number', 'Sales[2024]'],
    ['a column of the current row', '[@Item]'],
    ['a column with spaces in the current row', '[@[Unit price]]*2'],
    ['the current row', '[#This Row]'],
    ['a name in this workbook', '[0]!Rate'],
    ['brackets inside text', '"[1]Data!A1"'],
  ])('recalculates and renders a name with %s', async (_, expression) => {
    expect(await recalculationAndRenderOutcomes(await workbookWithName(expression))).toEqual([
      STAGED_FOR_RECALCULATION,
      STAGED_FOR_RENDERING,
    ]);
  });

  it('renders a list validation fed by a table column through a name', async () => {
    const data = await workbookPackage({
      sheetBody: VALUE_SHEET_BODY.replace(
        '<autoFilter ref="A1:B2"/>',
        '<dataValidations count="1"><dataValidation type="list" sqref="C1"><formula1>Items</formula1></dataValidation></dataValidations>',
      ),
      workbookTail:
        '<definedNames><definedName name="Items">Table1[Item]</definedName></definedNames>',
      extraParts: {
        'xl/tables/table1.xml': `<table xmlns="${MAIN_NAMESPACE}" id="1" name="Table1" displayName="Table1" ref="A1:B2"><tableColumns count="2"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Amount"/></tableColumns></table>`,
      },
    });
    expect(await recalculationAndRenderOutcomes(data)).toEqual([
      STAGED_FOR_RECALCULATION,
      STAGED_FOR_RENDERING,
    ]);
  });

  it('renders a chart whose series names a range in this workbook', async () => {
    const data = await workbookPackage({
      sheetBody: VALUE_SHEET_BODY,
      extraParts: {
        'xl/charts/chart1.xml': `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:val><c:numRef><c:f>[0]!Amounts</c:f></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`,
      },
    });
    expect(await recalculationAndRenderOutcomes(data)).toEqual([
      STAGED_FOR_RECALCULATION,
      STAGED_FOR_RENDERING,
    ]);
  });

  it.each([
    ['an indexed workbook before a sheet', '[1]Data!$A$1'],
    ['a large workbook index before a sheet', '[12]Data!$A$1'],
    ['a workbook file name before a sheet', '[Budget.xlsx]Data!$A$1'],
    ['a name in an indexed workbook', '[2]!Rate'],
    ['a name in a workbook file', '[Budget.xlsx]!Rate'],
    ['a workbook inside a quoted sheet name', "'[1]Other data'!$A$1"],
    ['a workbook file inside a quoted sheet name', "'[Budget.xlsx]Data'!$A$1"],
    ['a workbook after a table reference', 'Table1[Item]Data!$A$1'],
    ['a workbook after a table name', 'Table1[1]Data!$A$1'],
    ['a this-workbook index after a name', 'Table1[0]!Rate'],
    ['an unqualified column', '[Item]'],
    ['nesting deeper than a table reference allows', 'Table1[[[Item]]]'],
    ['a quote inside a table reference', "Table1[It'em]"],
    ['an unmatched closing bracket', 'Data!$A$1]'],
    ['an unmatched opening bracket', 'Table1[Item'],
  ])('refuses a name with %s', async (_, expression) => {
    expect(await recalculationAndRenderOutcomes(await workbookWithName(expression))).toEqual([
      OTHER_WORKBOOK,
      OTHER_WORKBOOK,
    ]);
  });

  it('refuses a chart whose series names a range in another workbook', async () => {
    const data = await workbookPackage({
      sheetBody: VALUE_SHEET_BODY,
      extraParts: {
        'xl/charts/chart1.xml': `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:val><c:numRef><c:f>[1]Data!$A$2:$B$2</c:f></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`,
      },
    });
    expect(await recalculationAndRenderOutcomes(data)).toEqual([OTHER_WORKBOOK, OTHER_WORKBOOK]);
  });
});

const FIELD_BEGIN = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>';
const FIELD_SEPARATE = '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const FIELD_END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

function instruction(text: string): string {
  return `<w:r><w:instrText xml:space="preserve">${text}</w:instrText></w:r>`;
}

describe('managed rendering reads each field instruction whole', () => {
  it.each<[string, string]>([
    ['a hyperlink keyword split across runs', field('HYPER', 'LINK "https://example.com/"')],
    ['a page keyword split across runs', field(' PA', 'GE ')],
    [
      'a condition with a nested merge field',
      `<w:p>${FIELD_BEGIN}${instruction(' IF ')}${FIELD_BEGIN}${instruction(' MERGEFIELD Amount ')}${FIELD_SEPARATE}<w:r><w:t>7</w:t></w:r>${FIELD_END}${instruction(' &gt; 5 "big" "small" ')}${FIELD_SEPARATE}<w:r><w:t>big</w:t></w:r>${FIELD_END}</w:p>`,
    ],
    [
      'a simple page field',
      '<w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>',
    ],
  ])('stages a document with %s for rendering', async (_, body) => {
    const data = await documentPackage(body);
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      STAGED_FOR_RENDERING,
    );
  });

  it.each<[string, string]>([
    ['a keyword split in three runs', field('IN', 'CLUDETE', 'XT "file:///etc/hostname"')],
    ['a short keyword split across runs', field('D', 'DE "cmd" "x"')],
    [
      'a keyword split around an empty nested field',
      `<w:p>${FIELD_BEGIN}${instruction('INCLUDE')}${FIELD_BEGIN}${instruction('QUOTE ""')}${FIELD_SEPARATE}${FIELD_END}${instruction('TEXT "file:///etc/hostname"')}${FIELD_SEPARATE}<w:r><w:t>x</w:t></w:r>${FIELD_END}</w:p>`,
    ],
    [
      'a keyword followed by a nested field',
      `<w:p>${FIELD_BEGIN}${instruction('INCLUDETEXT')}${FIELD_BEGIN}${instruction('QUOTE " "')}${FIELD_SEPARATE}<w:r><w:t xml:space="preserve"> </w:t></w:r>${FIELD_END}${instruction('file:///etc/hostname')}${FIELD_SEPARATE}<w:r><w:t>x</w:t></w:r>${FIELD_END}</w:p>`,
    ],
    [
      'an instruction after the separator',
      `<w:p>${FIELD_BEGIN}${instruction('X')}${FIELD_SEPARATE}${instruction('INCLUDETEXT "file:///etc/hostname"')}${FIELD_END}</w:p>`,
    ],
    [
      'a simple field',
      '<w:p><w:fldSimple w:instr=" INCLUDETEXT &quot;file:///etc/hostname&quot; "><w:r><w:t>x</w:t></w:r></w:fldSimple></w:p>',
    ],
    [
      'a field with no end',
      `<w:p>${FIELD_BEGIN}${instruction('INCLUDE')}${instruction('TEXT "file:///etc/hostname"')}</w:p>`,
    ],
  ])('refuses to render a document with %s', async (_, body) => {
    const data = await documentPackage(body);
    expect(await outcome(renderManagedOfficeFile(data, 'docx', workspaceRefusingExecutor))).toBe(
      'Active document fields are unsupported during rendering.',
    );
  });
});
