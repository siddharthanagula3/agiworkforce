import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  XLSX_NOT_CALCULATED,
  pptxToSlidesMarkdown,
  xlsxFirstSheetToCsv,
} from './office-file-preview';

async function workbook(sheetData: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('xlsxFirstSheetToCsv formula cells', () => {
  it('marks a formula cell without a cached value as not calculated', async () => {
    const csv = await xlsxFirstSheetToCsv(
      await workbook('<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f></c></row>'),
    );
    expect(csv).toBe(`2,${XLSX_NOT_CALCULATED}`);
  });

  it('shows the cached value of a formula cell when the file carries one', async () => {
    const csv = await xlsxFirstSheetToCsv(
      await workbook('<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f><v>4</v></c></row>'),
    );
    expect(csv).toBe('2,4');
  });
});

function shape(type: string | null, ...lines: string[]): string {
  const ph = type ? `<p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>` : '';
  const paragraphs = lines.map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join('');
  return `<p:sp>${ph}<p:txBody>${paragraphs}</p:txBody></p:sp>`;
}

async function deck(...shapes: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('pptxToSlidesMarkdown slide structure', () => {
  it('takes the title from the title placeholder and keeps footer and number out of the body', async () => {
    const markdown = await pptxToSlidesMarkdown(
      await deck(
        shape(null, 'Revenue grew 40%'),
        shape('title', 'Q3 results'),
        shape('ftr', 'Confidential'),
        shape('sldNum', '1'),
      ),
    );
    expect(markdown).toBe('# Q3 results\n- Revenue grew 40%\n_Confidential_');
  });

  it('falls back to the first text when no title placeholder exists', async () => {
    const markdown = await pptxToSlidesMarkdown(await deck(shape(null, 'Intro', 'Point')));
    expect(markdown).toBe('# Intro\n- Point');
  });
});
