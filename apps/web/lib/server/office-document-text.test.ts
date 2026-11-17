import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import PptxGenJS from 'pptxgenjs';
import { describe, expect, it, vi } from 'vitest';

import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { MAX_CELL_FORMATS } from '@agiworkforce/unified-chat/workbook-cell-formats';
import { displayCellNumber } from '@agiworkforce/unified-chat/workbook-number-formats';
import { MAX_DECOMPRESSION_RATIO, declaredMemberSize } from '@/lib/security/archive-bounds';

import {
  cellStyleFormats,
  extractOfficeDocumentText,
  extractSpreadsheetTable,
  officeDocumentKind,
  OfficeDocumentUnreadableError,
  OFFICE_DOCUMENT_FAILURE_REASONS,
  xmlElements,
  xmlStartTags,
  xmlTextRuns,
} from './office-document-text';

function patternTextRuns(xml: string, tag: string): string {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map((match) => match[1] ?? '')
    .join('');
}

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text })] })] });
}

async function buildDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Background', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'The onboarding owner is Marisol Trent.' }),
          new Table({
            rows: [
              new TableRow({ children: [cell('Vendor'), cell('Region'), cell('Annual cost')] }),
              new TableRow({ children: [cell('Ridgeway Labs'), cell('APAC'), cell('13975')] }),
            ],
          }),
          new Paragraph({ text: 'Contract reference GRAPE-5561-TANGO applies.' }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

function understateMemberSize(archive: Buffer, path: string): Buffer {
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
      result.writeUInt32LE(1, offset + 24);
      result.writeUInt32LE(1, localOffset + 22);
      return result;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Fixture member missing: ${path}`);
}

async function buildXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Revenue" sheetId="1" r:id="rId1"/><sheet name="Headcount" sheetId="2" r:id="rId2"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    '<?xml version="1.0"?><sst><si><t>Month</t></si><si><t>Jan</t></si><si><t>Secret code</t></si><si><t>MANGO-3308-DELTA</t></si></sst>',
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>107</v></c><c r="D2"><f>B2*2</f><v>214</v></c></row><row r="3"><c r="D3"><f>SUM(D2:D2)</f></c></row></sheetData></worksheet>',
  );
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>2</v></c><c r="B1" t="s"><v>3</v></c></row></sheetData></worksheet>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildPptx(): Promise<Buffer> {
  const presentation = new PptxGenJS();
  const first = presentation.addSlide();
  first.addText('Launch Readiness', { x: 1, y: 1, w: 8, h: 1 });
  first.addNotes('Ask for the budget decision.');
  const second = presentation.addSlide();
  second.addText('The blocker is WALNUT-7742-ECHO', { x: 1, y: 1, w: 8, h: 1 });
  const output = await presentation.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

describe('officeDocumentKind', () => {
  it('recognises Office documents by media type and by extension', () => {
    expect(
      officeDocumentKind(
        'q3.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('xlsx');
    expect(officeDocumentKind('deck.pptx', 'application/octet-stream')).toBe('pptx');
    expect(officeDocumentKind('brief.docx', '')).toBe('docx');
    expect(officeDocumentKind('notes.txt', 'text/plain')).toBeNull();
    expect(
      officeDocumentKind('macro.docm', 'application/vnd.ms-word.document.macroEnabled.12'),
    ).toBeNull();
  });
});

describe('extractOfficeDocumentText', () => {
  it('keeps DOCX headings and table rows readable', async () => {
    const text = await extractOfficeDocumentText(await buildDocx(), 'vendor-brief.docx', 'docx');

    expect(text).toContain('# Background');
    expect(text).toContain('| Vendor | Region | Annual cost |');
    expect(text).toContain('| Ridgeway Labs | APAC | 13975 |');
    expect(text).toContain('GRAPE-5561-TANGO');
  });

  it('passes Mammoth a rebuilt archive containing admitted bytes and package paths', async () => {
    const zip = await JSZip.loadAsync(await buildDocx());
    const marker = Buffer.from('DOCX-UNUSED-PART');
    zip.file('custom/unused.bin', marker);
    const input = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const convert = vi.spyOn(mammoth, 'convertToHtml');
    try {
      const text = await extractOfficeDocumentText(input, 'brief.docx', 'docx');
      expect(text).toContain('GRAPE-5561-TANGO');
      expect(convert).toHaveBeenCalledOnce();
      const passed = convert.mock.calls[0]?.[0];
      expect(passed).toHaveProperty('buffer');
      const buffer = (passed as { buffer: Buffer }).buffer;
      expect(buffer).not.toBe(input);
      const rebuilt = await JSZip.loadAsync(buffer);
      expect(Object.keys(rebuilt.files).sort()).toEqual(Object.keys(zip.files).sort());
      for (const entry of Object.values(rebuilt.files)) {
        if (!entry.dir) {
          expect(await entry.async('uint8array')).toEqual(
            await zip.file(entry.name)!.async('uint8array'),
          );
        }
      }
      let offset = buffer.readUInt32LE(buffer.length - 6);
      while (buffer.readUInt32LE(offset) === 0x02014b50) {
        expect(buffer.readUInt16LE(offset + 10)).toBe(0);
        offset +=
          46 +
          buffer.readUInt16LE(offset + 28) +
          buffer.readUInt16LE(offset + 30) +
          buffer.readUInt16LE(offset + 32);
      }
    } finally {
      convert.mockRestore();
    }
  });

  it.each([false, true])(
    'refuses understated DOCX inflation before Mammoth (shared budget: %s)',
    async (sharedBudget) => {
      const zip = await JSZip.loadAsync(await buildDocx());
      const memberBytes = sharedBudget ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
      if (sharedBudget) {
        zip.file('custom/ballast.bin', Buffer.alloc(16 * 1024), { compression: 'STORE' });
        zip.file('custom/first.bin', Buffer.alloc(memberBytes, 65));
      }
      zip.file('custom/last.bin', Buffer.alloc(memberBytes, 66));
      const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const input = understateMemberSize(archive, 'custom/last.bin');
      const ceiling = input.byteLength * MAX_DECOMPRESSION_RATIO;
      const parsed = await JSZip.loadAsync(input);
      const declared = Object.values(parsed.files).reduce(
        (total, entry) => total + (entry.dir ? 0 : declaredMemberSize(entry)),
        0,
      );
      expect(declared).toBeLessThan(ceiling);
      expect(memberBytes * (sharedBudget ? 2 : 1)).toBeGreaterThan(ceiling);
      if (sharedBudget) expect(memberBytes).toBeLessThan(ceiling);
      const convert = vi.spyOn(mammoth, 'convertToHtml');
      try {
        await expect(extractOfficeDocumentText(input, 'bomb.docx', 'docx')).rejects.toMatchObject({
          name: 'OfficeDocumentUnreadableError',
          reason: 'archive_bomb',
        });
        expect(convert).not.toHaveBeenCalled();
      } finally {
        convert.mockRestore();
      }
    },
  );

  it('reports a damaged member within the inflation budget as corrupt before Mammoth', async () => {
    const zip = await JSZip.loadAsync(await buildDocx());
    zip.file('custom/damaged.bin', Buffer.alloc(1024, 65));
    const input = understateMemberSize(
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
      'custom/damaged.bin',
    );
    const convert = vi.spyOn(mammoth, 'convertToHtml');
    try {
      await expect(extractOfficeDocumentText(input, 'damaged.docx', 'docx')).rejects.toMatchObject({
        name: 'OfficeDocumentUnreadableError',
        reason: 'corrupt',
      });
      expect(convert).not.toHaveBeenCalled();
    } finally {
      convert.mockRestore();
    }
  });

  it('names every sheet and keeps formulas as formulas', async () => {
    const text = await extractOfficeDocumentText(await buildXlsx(), 'operations.xlsx', 'xlsx');

    expect(text).toContain('## Sheet: Revenue');
    expect(text).toContain('## Sheet: Headcount');
    expect(text).toContain('D: =B2*2 (214)');
    expect(text).toContain('D: =SUM(D2:D2)');
    expect(text).toContain('MANGO-3308-DELTA');
  });

  it('stops a sheet at the row cap a caller sets and says the rest were omitted', async () => {
    const workbook = await buildXlsx();

    const capped = await extractOfficeDocumentText(workbook, 'operations.xlsx', 'xlsx', {
      maxSheetRows: 1,
    });
    const whole = await extractOfficeDocumentText(workbook, 'operations.xlsx', 'xlsx');

    expect(capped).toContain('## Sheet: Revenue\nRow 1: A: Month\n[Remaining rows omitted.]');
    expect(capped).not.toContain('Row 2:');
    expect(whole).toContain('Row 2: A: Jan');
    expect(whole).not.toContain('[Remaining rows omitted.]');
  });

  it('reads only the slides and characters a caller allows', async () => {
    const deck = await buildPptx();

    const oneSlide = await extractOfficeDocumentText(deck, 'launch-deck.pptx', 'pptx', {
      maxSlides: 1,
    });
    const short = await extractOfficeDocumentText(deck, 'launch-deck.pptx', 'pptx', {
      maxChars: 40,
    });

    expect(oneSlide).toContain('## Slide 1');
    expect(oneSlide).not.toContain('## Slide 2');
    expect(oneSlide).not.toContain('WALNUT-7742-ECHO');
    expect(short).not.toContain('WALNUT-7742-ECHO');
    expect(short.startsWith('## Slide 1')).toBe(true);
  });

  it('numbers slides and carries speaker notes', async () => {
    const text = await extractOfficeDocumentText(await buildPptx(), 'launch-deck.pptx', 'pptx');

    expect(text).toContain('## Slide 1');
    expect(text).toContain('Launch Readiness');
    expect(text).toContain('Speaker notes: Ask for the budget decision.');
    expect(text).toContain('WALNUT-7742-ECHO');
  });

  it('refuses bytes that are not an Office package', async () => {
    await expect(
      extractOfficeDocumentText(Buffer.from('not a zip at all'), 'broken.docx', 'docx'),
    ).rejects.toBeInstanceOf(OfficeDocumentUnreadableError);
  });

  it('refuses a spreadsheet package with no workbook part', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'nothing to see');

    await expect(
      extractOfficeDocumentText(
        await zip.generateAsync({ type: 'nodebuffer' }),
        'empty.xlsx',
        'xlsx',
      ),
    ).rejects.toBeInstanceOf(OfficeDocumentUnreadableError);
  });
});

const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function styledXlsx(options: {
  sheetXml: string;
  stylesXml?: string;
  stylesTarget?: string;
  date1904?: boolean;
  sharedStringsXml?: string;
  storedBallastBytes?: number;
}): Promise<Buffer> {
  const zip = new JSZip();
  const workbookPr =
    options.date1904 === undefined
      ? ''
      : `<workbookPr date1904="${options.date1904 ? '1' : '0'}"/>`;
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns:r="${RELATIONSHIP_NS}">${workbookPr}<sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>`,
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
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><worksheet><sheetData>${options.sheetXml}</sheetData></worksheet>`,
  );
  if (options.storedBallastBytes) {
    zip.file('xl/media/ballast.bin', Buffer.alloc(options.storedBallastBytes), {
      compression: 'STORE',
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

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
  return `<?xml version="1.0"?><styleSheet>${
    numFmts ? `<numFmts count="${Object.keys(custom).length}">${numFmts}</numFmts>` : ''
  }<cellStyleXfs count="2"><xf numFmtId="14"/><xf numFmtId="9"/></cellStyleXfs><cellXfs count="${
    cellFormats.length
  }">${cellXfs}</cellXfs><dxfs count="1"><dxf><numFmt numFmtId="14" formatCode="0.00%"/></dxf></dxfs></styleSheet>`;
}

function numberRow(row: number, cells: { value: string; style?: string }[]): string {
  return `<row r="${row}">${cells
    .map(
      (cell, index) =>
        `<c r="${String.fromCharCode(65 + index)}${row}"${
          cell.style === undefined ? '' : ` s="${cell.style}"`
        }><v>${cell.value}</v></c>`,
    )
    .join('')}</row>`;
}

async function sheetText(data: Buffer, sizing?: 'per-member'): Promise<string> {
  return extractOfficeDocumentText(data, 'ledger.xlsx', 'xlsx', sizing ? { sizing } : {});
}

describe('inline workbook number formats', () => {
  const afternoon = String(45292 + (13 * 3600 + 47 * 60 + 30) / 86400);

  it('gives the model dates, times, percentages and separated numbers as the workbook shows them', async () => {
    const text = await sheetText(
      await styledXlsx({
        sheetXml:
          numberRow(1, [
            { value: '45292', style: '1' },
            { value: afternoon, style: '2' },
            { value: afternoon, style: '3' },
            { value: afternoon, style: '4' },
            { value: '0.285', style: '5' },
            { value: '0.12345', style: '6' },
            { value: '1234567.4', style: '7' },
            { value: '-1234.5', style: '8' },
            { value: '1.005', style: '9' },
            { value: '1234.5', style: '10' },
            { value: '42' },
            { value: afternoon, style: '11' },
          ]) + '<row r="2"><c r="A2" s="1"><f>TODAY()</f><v>45293</v></c></row>',
        stylesXml: stylesXml([0, 14, 22, 20, 21, 9, 10, 3, 4, 2, 164, 165], {
          164: '"$"#,##0.00',
          165: 'yyyy-mm-dd hh:mm:ss',
        }),
      }),
    );

    expect(text).toBe(
      [
        '## Sheet: Ledger',
        'Row 1: A: 2024-01-01 | B: 2024-01-01 13:47 | C: 13:47 | D: 13:47:30 | E: 29% | F: 12.35% | G: 1,234,567 | H: -1,234.50 | I: 1.01 | J: $1,234.50 | K: 42 | L: 2024-01-01 13:47:30',
        'Row 2: A: =TODAY() (2024-01-02)',
      ].join('\n'),
    );
  });

  it('reads serials in the 1904 date system when the workbook says so', async () => {
    const sheetXml = numberRow(1, [
      { value: '43830', style: '1' },
      { value: '0', style: '1' },
    ]);
    const styles = stylesXml([0, 14]);

    const in1904 = await sheetText(
      await styledXlsx({ sheetXml, stylesXml: styles, date1904: true }),
    );
    const in1900 = await sheetText(await styledXlsx({ sheetXml, stylesXml: styles }));

    expect(in1904).toContain('Row 1: A: 2024-01-01 | B: 1904-01-01');
    expect(in1900).toContain('Row 1: A: 2019-12-31 | B: 0');
  });

  it('keeps the stored value for a format it cannot show faithfully or a style the file does not declare', async () => {
    const text = await sheetText(
      await styledXlsx({
        sheetXml: numberRow(1, [
          { value: '12345.678', style: '1' },
          { value: '12345.678', style: '2' },
          { value: '12345.678', style: '3' },
          { value: '12345.678', style: '4' },
          { value: '45292', style: '9' },
          { value: '45292', style: 'x' },
        ]),
        stylesXml: stylesXml([0, 11, 164, 165, 166], {
          164: '[Red]0.00',
          165: '0.00;(0.00)',
          166: '#,##0,',
        }),
      }),
    );

    expect(text).toContain(
      'Row 1: A: 12345.678 | B: 12345.678 | C: 12345.678 | D: 12345.678 | E: 45292 | F: 45292',
    );
  });

  it('finds the styles part through the workbook relationships', async () => {
    const text = await sheetText(
      await styledXlsx({
        sheetXml: numberRow(1, [{ value: '0.25', style: '1' }]),
        stylesXml: stylesXml([0, 9]),
        stylesTarget: 'theme/s.xml',
      }),
    );

    expect(text).toContain('Row 1: A: 25%');
  });

  it('gives stored values without failing when the styles part is missing, oversized or broken', async () => {
    const sheetXml = numberRow(1, [{ value: '45292', style: '1' }]);
    const padded = `${stylesXml([0, 14])}${' '.repeat(4 * 1024 * 1024)}`;
    const honestOversized = await styledXlsx({ sheetXml, stylesXml: padded });
    expect(
      declaredMemberSize((await JSZip.loadAsync(honestOversized)).file('xl/styles.xml')!),
    ).toBeGreaterThan(honestOversized.byteLength * MAX_DECOMPRESSION_RATIO);
    const variants: { data: Buffer; sizing?: 'per-member' }[] = [
      { data: await styledXlsx({ sheetXml }) },
      {
        data: await styledXlsx({
          sheetXml,
          stylesXml: '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/>',
        }),
      },
      {
        data: await styledXlsx({
          sheetXml,
          stylesXml: `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="${'y'.repeat(
            MAX_FILE_TEXT_CHARS + 1,
          )}"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
          storedBallastBytes: 64 * 1024,
        }),
      },
      {
        data: await styledXlsx({
          sheetXml,
          stylesXml: `<styleSheet><cellXfs><xf numFmtId="0"/>${'<xf numFmtId="14"/>'.repeat(
            MAX_CELL_FORMATS,
          )}</cellXfs></styleSheet>`,
          storedBallastBytes: 64 * 1024,
        }),
      },
      {
        data: await styledXlsx({
          sheetXml,
          stylesXml:
            '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="&#99999999;"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
        }),
      },
      { data: understateMemberSize(honestOversized, 'xl/styles.xml') },
      { data: honestOversized, sizing: 'per-member' },
    ];

    for (const { data, sizing } of variants) {
      expect(await sheetText(data, sizing)).toBe('## Sheet: Ledger\nRow 1: A: 45292');
    }
    const atTheBound = await styledXlsx({
      sheetXml,
      stylesXml: `<styleSheet><cellXfs><xf numFmtId="0"/>${'<xf numFmtId="14"/>'.repeat(
        MAX_CELL_FORMATS - 1,
      )}</cellXfs></styleSheet>`,
      storedBallastBytes: 64 * 1024,
    });
    expect(await sheetText(atTheBound)).toBe('## Sheet: Ledger\nRow 1: A: 2024-01-01');
  });

  it('keeps text, booleans, errors, formula strings and shared and inline strings as stored under a date style', async () => {
    const text = await sheetText(
      await styledXlsx({
        sheetXml:
          '<row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1" t="inlineStr" s="1"><is><t>45292</t></is></c><c r="C1" t="b" s="1"><v>1</v></c><c r="D1" t="e" s="1"><v>#DIV/0!</v></c><c r="E1" t="str" s="1"><f>"4529"&amp;"2"</f><v>45292</v></c><c r="F1" t="d" s="1"><v>2024-01-01T00:00:00</v></c></row>',
        sharedStringsXml: '<?xml version="1.0"?><sst><si><t>45292</t></si></sst>',
        stylesXml: stylesXml([0, 14]),
      }),
    );

    expect(text).toBe(
      '## Sheet: Ledger\nRow 1: A: 45292 | B: 45292 | C: 1 | D: #DIV/0! | E: ="4529"&"2" (45292) | F: 2024-01-01T00:00:00',
    );
  });

  it('lays out a workbook with no number formats exactly as before', async () => {
    expect(await extractOfficeDocumentText(await buildXlsx(), 'operations.xlsx', 'xlsx')).toBe(
      [
        '## Sheet: Revenue',
        'Row 1: A: Month',
        'Row 2: A: Jan | B: 107 | D: =B2*2 (214)',
        'Row 3: D: =SUM(D2:D2)',
        '',
        '## Sheet: Headcount',
        'Row 1: A: Secret code | B: MANGO-3308-DELTA',
      ].join('\n'),
    );
  });

  it('shows formatted values in the spreadsheet preview table', async () => {
    const table = await extractSpreadsheetTable(
      await styledXlsx({
        sheetXml: numberRow(1, [
          { value: '45292', style: '1' },
          { value: '0.5', style: '2' },
        ]),
        stylesXml: stylesXml([0, 14, 9]),
      }),
      'ledger.xlsx',
      MAX_FILE_TEXT_CHARS,
    );

    expect(table).toEqual({ csv: '"2024-01-01","50%"', complete: true });
  });
});

describe('inline workbook cell positions', () => {
  const sheetXml =
    '<row r="1"><c r="A1" s="1"/><c r="B1"><v>5</v></c></row>' +
    '<row r="2" ht="30" customHeight="1"/>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>Total</t></is></c><c r="C4"><v>9</v></c></row>' +
    '<row><c t="inlineStr"><is><t>Spare</t></is></c><c><v>1</v></c><c><v>2</v></c></row>';

  it('keeps each cell in its row and column across self-closing elements and omitted references', async () => {
    expect(await sheetText(await styledXlsx({ sheetXml }))).toBe(
      [
        '## Sheet: Ledger',
        'Row 1: B: 5',
        'Row 4: A: Total | C: 9',
        'Row 5: A: Spare | B: 1 | C: 2',
      ].join('\n'),
    );
  });

  it('keeps every column of the preview table when cells omit their references', async () => {
    const table = await extractSpreadsheetTable(
      await styledXlsx({ sheetXml }),
      'ledger.xlsx',
      MAX_FILE_TEXT_CHARS,
    );

    expect(table.csv).toBe(['"","5",""', '"Total","","9"', '"Spare","1","2"'].join('\n'));
  });

  it('reads a shared string cell with no value as empty, not as the first shared string', async () => {
    const text = await sheetText(
      await styledXlsx({
        sheetXml:
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"/><c r="C1" t="s"></c><c t="s"/><c r="E1"><v>7</v></c></row>',
        sharedStringsXml: '<?xml version="1.0"?><sst><si><t>Name</t></si></sst>',
      }),
    );

    expect(text).toBe(['## Sheet: Ledger', 'Row 1: A: Name | E: 7'].join('\n'));
  });
});

describe('workbook XML helpers shared with the large-file path', () => {
  it('reads elements by exact name, self-closing or not, and stops at one never closed', () => {
    const xml =
      '<rowBreaks count="1"/><row r="1" ht="30"/><row r="2"><c r="A2"/></row><row r="3"><c/>';

    expect([...xmlElements(xml, 'row')]).toEqual([
      { attributes: ' r="1" ht="30"', body: '' },
      { attributes: ' r="2"', body: '<c r="A2"/>' },
    ]);
    expect([...xmlStartTags(xml, 'row')].map(({ attributes }) => attributes)).toEqual([
      ' r="1" ht="30"/',
      ' r="2"',
      ' r="3"',
    ]);
  });

  it('gives each cell style the number format the workbook declares for it', () => {
    const formats = cellStyleFormats(stylesXml([0, 14, 9, 164], { 164: '#,##0.00' }));

    expect(formats).toHaveLength(4);
    expect(formats.map((format) => displayCellNumber('45292', format, false))).toEqual([
      '45292',
      '2024-01-01',
      '4529200%',
      '45,292.00',
    ]);
    expect(cellStyleFormats('<styleSheet><cellXfs><xf numFmtId="14"/>')).toEqual([]);
  });
});

describe('a file that cannot be read says why in words a reader can act on', () => {
  async function failureFor(data: Buffer, fileName: string, kind: 'docx' | 'xlsx' | 'pptx') {
    try {
      await extractOfficeDocumentText(data, fileName, kind);
    } catch (error) {
      if (error instanceof OfficeDocumentUnreadableError) return error;
      throw error;
    }
    throw new Error(`${fileName} was read when it should not have been`);
  }

  it('names a password-protected package rather than calling it damaged', async () => {
    const encrypted = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);
    const failure = await failureFor(encrypted, 'locked.docx', 'docx');
    expect(failure.reason).toBe('encrypted');
    expect(failure.message).toContain('password');
  });

  it('refuses a package that carries a macro project', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    zip.file('word/vbaProject.bin', Buffer.from([0x00, 0x01, 0x02, 0x03]));
    const failure = await failureFor(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'macros.docx',
      'docx',
    );
    expect(failure.reason).toBe('macro_present');
    expect(failure.message).toContain('macros');
  });

  it('calls bytes that are not a package damaged, without quoting the decoder', async () => {
    const failure = await failureFor(Buffer.from('not a zip at all'), 'broken.docx', 'docx');
    expect(failure.reason).toBe('corrupt');
    expect(failure.message).not.toMatch(/zip|jszip|mammoth|offset|0x/i);
  });

  it('gives every declared reason a distinct message', () => {
    const messages = OFFICE_DOCUMENT_FAILURE_REASONS.map(
      (reason) => new OfficeDocumentUnreadableError('a.docx', reason).message,
    );
    expect(new Set(messages).size).toBe(OFFICE_DOCUMENT_FAILURE_REASONS.length);
    for (const message of messages) expect(message.startsWith('a.docx ')).toBe(true);
  });
});

describe('XML text runs', () => {
  it('reads the runs the element pattern matched, by index scans', () => {
    let state = 7;
    const random = () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return state / 4_294_967_296;
    };
    const pieces = [
      '<a:t>',
      '<a:t x="1">',
      '</a:t>',
      '<a:tab/>',
      '<a:t/>',
      '<a:t',
      '>',
      'x',
      ' ',
      '<',
      '/',
    ];
    for (let sample = 0; sample < 5_000; sample += 1) {
      let xml = '';
      const length = Math.floor(random() * 16);
      for (let index = 0; index < length; index += 1)
        xml += pieces[Math.floor(random() * pieces.length)]!;
      expect(xmlTextRuns(xml, 'a:t'), xml).toBe(patternTextRuns(xml, 'a:t'));
    }
  });
});
