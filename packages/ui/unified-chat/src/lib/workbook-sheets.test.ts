import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import {
  MAX_WORKBOOK_SHEETS,
  WorkbookFormatError,
  WorkbookPreviewLimitError,
  XLSX_NOT_CALCULATED,
  readWorkbookSheets,
} from './tabular';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function noise(length: number, seed: number): string {
  let state = seed;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    text += String.fromCharCode(97 + ((state >>> 0) % 26));
  }
  return text;
}

function workbook(members: Record<string, string>, level: 0 | 6 = 6): Uint8Array {
  const files: Zippable = {};
  for (const [path, xml] of Object.entries(members)) files[path] = [strToU8(xml), { level }];
  return zipSync(files);
}

function workbookXml(sheets: { name: string; id: string }[], prefix = 'r'): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN_NS}" xmlns:${prefix}="${REL_NS}"><sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${sheet.name}" sheetId="${index + 1}" ${prefix}:id="${sheet.id}"/>`,
    )
    .join('')}</sheets></workbook>`;
}

function relsXml(targets: Record<string, string>): string {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(
    targets,
  )
    .map(
      ([id, target]) => `<Relationship Id="${id}" Type="${REL_NS}/worksheet" Target="${target}"/>`,
    )
    .join('')}</Relationships>`;
}

function sheetXml(rows: string, prefix = ''): string {
  const p = prefix ? `${prefix}:` : '';
  return `<?xml version="1.0"?><${p}worksheet xmlns${prefix ? `:${prefix}` : ''}="${MAIN_NS}"><${p}sheetData>${rows}</${p}sheetData></${p}worksheet>`;
}

const SHARED = `<sst xmlns="${MAIN_NS}" count="3" uniqueCount="3">
<si><t>Region</t></si>
<si><r><t>Nor</t></r><r><t xml:space="preserve">th</t></r></si>
<si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si>
</sst>`;

describe('readWorkbookSheets', () => {
  it('reads every sheet in workbook order with shared, inline, cached and uncalculated cells', () => {
    const bytes = workbook({
      'xl/workbook.xml': workbookXml([
        { name: 'Summary &amp; notes', id: 'rId3' },
        { name: 'Data', id: 'rId1' },
        { name: 'Inline', id: 'rId2' },
      ]),
      'xl/_rels/workbook.xml.rels': relsXml({
        rId1: 'worksheets/sheet1.xml',
        rId2: '/xl/worksheets/sheet2.xml',
        rId3: './worksheets/../worksheets/sheet3.xml',
      }),
      'xl/sharedStrings.xml': SHARED,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f>SUM(C1)</f><v>42</v></c>' +
          '<c r="C2"><f>NOW()</f></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>2</v></c></row>',
      ),
      'xl/worksheets/sheet2.xml': sheetXml(
        '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>a, "b"</x:t></x:is></x:c>' +
          '<x:c r="B1" t="inlineStr"><x:is><x:t>line\nbreak</x:t></x:is></x:c></x:row>',
        'x',
      ),
      'xl/worksheets/sheet3.xml': sheetXml(
        '<row r="1"><c r="B1" t="str"><v>Q&amp;A &lt;1&gt; &#x2713;</v></c></row>',
      ),
    });

    expect(readWorkbookSheets(bytes)).toEqual([
      { name: 'Summary & notes', csv: ',Q&A <1> ✓' },
      {
        name: 'Data',
        csv: `Region,,42\nNorth,42,${XLSX_NOT_CALCULATED}\n東京,,`,
      },
      { name: 'Inline', csv: '"a, ""b""","line\nbreak"' },
    ]);
  });

  it('reads members stored without compression', () => {
    const bytes = workbook(
      {
        'xl/workbook.xml': workbookXml([{ name: 'Only', id: 'rId1' }]),
        'xl/_rels/workbook.xml.rels': relsXml({ rId1: 'worksheets/sheet1.xml' }),
        'xl/worksheets/sheet1.xml': sheetXml('<row><c><v>1</v></c><c><v>2</v></c></row>'),
      },
      0,
    );

    expect(readWorkbookSheets(bytes)).toEqual([{ name: 'Only', csv: '1,2' }]);
  });

  it('resolves the relationship id through whatever prefix the workbook binds', () => {
    const bytes = workbook({
      'xl/workbook.xml': workbookXml([{ name: 'Renamed', id: 'rId7' }], 'rel'),
      'xl/_rels/workbook.xml.rels': relsXml({ rId7: 'worksheets/sheet1.xml' }),
      'xl/worksheets/sheet1.xml': sheetXml('<row><c r="A1"><v>7</v></c></row>'),
    });

    expect(readWorkbookSheets(bytes)).toEqual([{ name: 'Renamed', csv: '7' }]);
  });

  it('falls back to the first worksheet when the workbook part is missing', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': sheetXml('<row><c r="A1"><v>3</v></c></row>'),
    });

    expect(readWorkbookSheets(bytes)).toEqual([{ name: 'Sheet1', csv: '3' }]);
  });

  it('reads at most the sheet limit', () => {
    const count = MAX_WORKBOOK_SHEETS + 5;
    const ids = Array.from({ length: count }, (_, index) => `rId${index + 1}`);
    const members: Record<string, string> = {
      'xl/workbook.xml': workbookXml(ids.map((id, index) => ({ name: `S${index + 1}`, id }))),
      'xl/_rels/workbook.xml.rels': relsXml(
        Object.fromEntries(ids.map((id, index) => [id, `worksheets/sheet${index + 1}.xml`])),
      ),
    };
    ids.forEach((_, index) => {
      members[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(
        `<row><c r="A1"><v>${index + 1}</v></c></row>`,
      );
    });

    const sheets = readWorkbookSheets(workbook(members));
    expect(sheets).toHaveLength(MAX_WORKBOOK_SHEETS);
    expect(sheets[sheets.length - 1]).toEqual({
      name: `S${MAX_WORKBOOK_SHEETS}`,
      csv: String(MAX_WORKBOOK_SHEETS),
    });
  });

  it('says the workbook is too large once its text passes the preview limit', () => {
    const size = Math.ceil(MAX_FILE_TEXT_CHARS / 2) + 1;
    const bytes = workbook({
      'xl/workbook.xml': workbookXml([
        { name: 'One', id: 'rId1' },
        { name: 'Two', id: 'rId2' },
      ]),
      'xl/_rels/workbook.xml.rels': relsXml({
        rId1: 'worksheets/sheet1.xml',
        rId2: 'worksheets/sheet2.xml',
      }),
      'xl/worksheets/sheet1.xml': sheetXml(`<row><c t="str"><v>${noise(size, 1)}</v></c></row>`),
      'xl/worksheets/sheet2.xml': sheetXml(`<row><c t="str"><v>${noise(size, 2)}</v></c></row>`),
    });

    expect(() => readWorkbookSheets(bytes)).toThrow(WorkbookPreviewLimitError);
  });

  it('counts only the shared strings a sheet shows against the limit', () => {
    const filler = Array.from(
      { length: 30 },
      (_, index) => `<si><t>${noise(10_000, index + 1)}</t></si>`,
    );
    const bytes = workbook({
      'xl/workbook.xml': workbookXml([{ name: 'Data', id: 'rId1' }]),
      'xl/_rels/workbook.xml.rels': relsXml({ rId1: 'worksheets/sheet1.xml' }),
      'xl/sharedStrings.xml': `<sst xmlns="${MAIN_NS}">${filler.join('')}<si><t>kept</t></si></sst>`,
      'xl/worksheets/sheet1.xml': sheetXml(`<row><c t="s"><v>${filler.length}</v></c></row>`),
    });

    expect(readWorkbookSheets(bytes)).toEqual([{ name: 'Data', csv: 'kept' }]);
  });

  it('stops at the decompression bound instead of inflating a bomb', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': sheetXml('<a/>'.repeat(6_000_000)),
    });

    expect(() => readWorkbookSheets(bytes)).toThrow(WorkbookFormatError);
  });

  it('refuses a document type declaration', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': `<!DOCTYPE x [<!ENTITY a "b">]>${sheetXml('<row/>')}`,
    });

    expect(() => readWorkbookSheets(bytes)).toThrow(WorkbookFormatError);
  });

  it('rejects bytes that are not a workbook archive', () => {
    expect(() => readWorkbookSheets(strToU8('Region,Revenue\nNorth,1200'))).toThrow(
      WorkbookFormatError,
    );
  });

  it('fails on a truncated archive without calling it too large', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': sheetXml('<row><c><v>1</v></c></row>'),
    });
    const broken = bytes.slice(0, bytes.length - 30);

    expect(() => readWorkbookSheets(broken)).toThrow();
    expect(() => readWorkbookSheets(broken)).not.toThrow(WorkbookPreviewLimitError);
  });
});
