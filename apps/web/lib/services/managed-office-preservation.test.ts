import { createHash } from 'node:crypto';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { E2BExecutor } from '@/lib/e2b/types';

import {
  editManagedDocx,
  editManagedWorkbook,
  recalculateManagedWorkbook,
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

async function workbookPackage(rows: string): Promise<Buffer> {
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
    `<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="sheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData>${rows}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function attachment(data: Buffer, mimeType: string, filename: string) {
  return { filename, mimeType, base64: data.toString('base64') };
}

const ARRAY_ROWS =
  '<row r="1"><c r="A1"><f t="array" ref="A1:A2">B1:B2*2</f><v>2</v></c><c r="B1"><v>1</v></c></row>' +
  '<row r="2"><c r="A2"><v>4</v></c><c r="B2"><v>2</v></c></row>';

async function sheetXml(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  return zip.file('xl/worksheets/sheet1.xml')!.async('string');
}

describe('editing a workbook that holds an array formula', () => {
  async function edit(cell: string, expected: number, value: number) {
    const data = await workbookPackage(ARRAY_ROWS);
    return editManagedWorkbook(
      {
        filename: 'array.xlsx',
        sha256: sha256(data),
        edits: [{ sheet: 'Data', cell, expected, value }],
      },
      [attachment(data, XLSX_MIME, 'array.xlsx')],
    );
  }

  it('refuses to overwrite a cell that holds a result of the array formula', async () => {
    await expect(edit('A2', 4, 99)).rejects.toThrow(/array/);
  });

  it('refuses the cell that anchors the array formula', async () => {
    await expect(edit('A1', 2, 99)).rejects.toThrow(/array/);
  });

  it('still edits an input cell outside the array result range', async () => {
    const edited = await edit('B2', 2, 3);

    expect(await sheetXml(edited.data)).toContain('<c r="B2"><v>3</v></c>');
  });
});

describe('recalculating a workbook that holds an array formula', () => {
  function evaluator(calculatedRows: string) {
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
          `<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData>${calculatedRows}</sheetData></worksheet>`,
        );
        return zip.generateAsync({ type: 'uint8array' });
      },
      runCode: async () => ({ ok: false, output: '', error: 'not used' }),
      dispose: async () => undefined,
    };
    return { executor, staged: () => staged };
  }

  const EDITED_ROWS =
    '<row r="1"><c r="A1"><f t="array" ref="A1:A2">B1:B2*2</f><v>2</v></c><c r="B1"><v>1</v></c></row>' +
    '<row r="2"><c r="A2"><v>4</v></c><c r="B2"><v>3</v></c></row>';
  const CALCULATED_ROWS =
    '<row r="1"><c r="A1"><f t="array" ref="A1:A2">B1:B2*2</f><v>2</v></c><c r="B1"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="n"><v>6</v></c><c r="B2"><v>3</v></c></row>';

  it('delivers the recalculated value of every cell in the array result range', async () => {
    const { executor, staged } = evaluator(CALCULATED_ROWS);
    const input = await workbookPackage(EDITED_ROWS);

    const delivered = await recalculateManagedWorkbook(input, executor);

    const stagedSheet = await sheetXml(staged());
    expect(stagedSheet).not.toContain('<v>4</v>');
    const sheet = await sheetXml(delivered);
    expect(sheet).toContain('<c r="A2" t="n"><v>6</v></c>');
    expect(sheet).not.toContain('<v>4</v>');
    expect(sheet).toContain('<c r="B2"><v>3</v></c>');
  });

  it('fails instead of delivering a stale result when the evaluator returns none', async () => {
    const withoutResult = CALCULATED_ROWS.replace('<c r="A2" t="n"><v>6</v></c>', '<c r="A2"/>');
    const { executor } = evaluator(withoutResult);
    const input = await workbookPackage(EDITED_ROWS);

    await expect(recalculateManagedWorkbook(input, executor)).rejects.toThrow(
      /unsupported formula cache/,
    );
  });
});

describe('editing a cell next to an empty self-closing cell', () => {
  const ROWS = '<row r="1"><c r="C1" s="1"/><c r="D1"><v>2</v></c></row>';

  async function edit(cell: string, expected: number, value: number) {
    const data = await workbookPackage(ROWS);
    return editManagedWorkbook(
      {
        filename: 'sparse.xlsx',
        sha256: sha256(data),
        edits: [{ sheet: 'Data', cell, expected, value }],
      },
      [attachment(data, XLSX_MIME, 'sparse.xlsx')],
    );
  }

  it('does not drop the following cell when the empty cell is edited', async () => {
    const edited = await sheetXml((await edit('C1', 0, 7)).data);

    expect(edited).toContain('<c r="C1" s="1"><v>7</v></c>');
    expect(edited).toContain('<c r="D1"><v>2</v></c>');
  });

  it('edits the following cell without touching the empty one', async () => {
    const edited = await sheetXml((await edit('D1', 2, 5)).data);

    expect(edited).toContain('<c r="C1" s="1"/>');
    expect(edited).toContain('<c r="D1"><v>5</v></c>');
  });
});

describe('editing document text that holds XML entities', () => {
  async function documentPackage(body: string): Promise<Buffer> {
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
      `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body><w:p><w:r>${body}</w:r></w:p></w:body></w:document>`,
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async function replace(body: string, find: string, replacement: string, expectedMatches = 1) {
    const data = await documentPackage(body);
    const edited = await editManagedDocx(
      {
        filename: 'brief.docx',
        sha256: sha256(data),
        replacements: [{ find, replace: replacement, expectedMatches }],
      },
      [attachment(data, DOCX_MIME, 'brief.docx')],
    );
    const zip = await JSZip.loadAsync(edited.data);
    return zip.file('word/document.xml')!.async('string');
  }

  it('does not match the spelling of an entity as document text', async () => {
    await expect(replace('<w:t>Tom &amp; Jerry</w:t>', 'amp', 'lt')).rejects.toThrow(
      /match count differs/,
    );
  });

  it('matches the character an entity stands for', async () => {
    const xml = await replace('<w:t>Tom &amp; Jerry</w:t>', '&', 'and');

    expect(xml).toContain('Tom and Jerry');
    expect(xml).not.toContain('&amp;');
  });

  it('does not count the letters of an entity toward a word that really appears once', async () => {
    const xml = await replace('<w:t>The amp &amp; the cable</w:t>', 'amp', 'adapter');

    expect(xml).toContain('The adapter &amp; the cable');
  });

  it('writes a replacement containing markup characters as escaped text', async () => {
    const xml = await replace('<w:t>Fish and chips</w:t>', 'and', '<&>');

    expect(xml).toContain('Fish &lt;&amp;&gt; chips');
  });

  it('leaves a run it does not change exactly as it was spelled', async () => {
    const xml = await replace(
      '<w:t>It&#8217;s kept</w:t></w:r><w:r><w:t>old value</w:t>',
      'old',
      'new',
    );

    expect(xml).toContain('<w:t>It&#8217;s kept</w:t>');
    expect(xml).toContain('new value');
  });
});
