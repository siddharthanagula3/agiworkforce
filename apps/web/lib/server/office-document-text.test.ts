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
import PptxGenJS from 'pptxgenjs';
import { describe, expect, it } from 'vitest';

import {
  extractOfficeDocumentText,
  officeDocumentKind,
  OfficeDocumentUnreadableError,
  OFFICE_DOCUMENT_FAILURE_REASONS,
} from './office-document-text';

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

  it('names every sheet and keeps formulas as formulas', async () => {
    const text = await extractOfficeDocumentText(await buildXlsx(), 'operations.xlsx', 'xlsx');

    expect(text).toContain('## Sheet: Revenue');
    expect(text).toContain('## Sheet: Headcount');
    expect(text).toContain('D: =B2*2 (214)');
    expect(text).toContain('D: =SUM(D2:D2)');
    expect(text).toContain('MANGO-3308-DELTA');
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
