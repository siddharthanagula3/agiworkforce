import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import {
  MAX_WORKBOOK_SHEETS,
  WorkbookFormatError,
  WorkbookPreviewLimitError,
  XLSX_NOT_CALCULATED,
  parseCsvTable,
  readWorkbookSheets,
  toCsv,
} from './tabular';
import { displayCellNumber, parseNumberFormat } from './workbook-number-formats';

type NumberFormatsModule = typeof import('./workbook-number-formats');

vi.mock('./workbook-number-formats', async (importOriginal) => {
  const actual = await importOriginal<NumberFormatsModule>();
  return {
    ...actual,
    displayCellNumber: vi.fn(actual.displayCellNumber),
    parseNumberFormat: vi.fn(actual.parseNumberFormat),
  };
});

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

function sheetCsv(rows: string): string {
  const sheets = readWorkbookSheets(workbook({ 'xl/worksheets/sheet1.xml': sheetXml(rows) }));
  return sheets[0]!.csv;
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

  it('keeps the empty rows a sheet leaves out between its rows', () => {
    const csv = sheetCsv(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Heading</t></is></c></row>' +
        '<row r="4"><c r="A4"><v>42</v></c></row>',
    );

    expect(csv).toBe('Heading\n\n\n42');
    const grid = parseCsvTable(csv);
    expect(grid?.columns).toEqual(['Heading']);
    expect(grid?.rows).toEqual([[''], [''], ['42']]);
    expect(toCsv(grid!)).toBe('Heading\n\n\n42');
  });

  it('starts at the first row that holds a value and keeps the empty rows after it', () => {
    const csv = sheetCsv(
      '<row r="2"><c r="A2" s="1"/></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>Region</t></is></c>' +
        '<c r="B3" t="inlineStr"><is><t>Revenue</t></is></c></row>' +
        '<row r="5"><c r="B5"><v>3</v></c></row>',
    );

    expect(csv).toBe('Region,Revenue\n,\n,3');
    expect(parseCsvTable(csv)?.columns).toEqual(['Region', 'Revenue']);
    expect(sheetCsv('<row r="1048576"><c r="A1048576"><v>1</v></c></row>')).toBe('1');
    expect(sheetCsv(`<row r="5000">${'<c><v>1</v></c>'.repeat(50)}</row>`)).toBe(
      Array.from({ length: 50 }, () => '1').join(','),
    );
  });

  it('places a row without an index after the row before it', () => {
    expect(
      sheetCsv(
        '<row r="1"><c><v>0</v></c></row><row r="3"><c r="A3"><v>1</v></c></row>' +
          '<row><c><v>2</v></c></row>',
      ),
    ).toBe('0\n\n1\n2');
  });

  it('places a repeated, descending or unreadable row index after the row before it', () => {
    expect(
      sheetCsv(
        '<row r="1"><c><v>0</v></c></row>' +
          '<row r="3"><c><v>1</v></c></row><row r="3"><c><v>2</v></c></row>' +
          '<row r="2"><c><v>3</v></c></row><row r="0"><c><v>4</v></c></row>' +
          '<row r="x"><c><v>5</v></c></row><row r="-9"><c><v>6</v></c></row>',
      ),
    ).toBe('0\n\n1\n2\n3\n4\n5\n6');
  });

  it('places a row after a gap and each cell in its own column', () => {
    expect(
      sheetCsv(
        '<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>' +
          '<row r="3"><c r="B3"><v>5</v></c></row>',
      ),
    ).toBe('1,,3\n,,\n,5,');
  });

  it('adds no empty rows after the last row that holds a cell', () => {
    expect(
      sheetCsv('<row r="1"><c r="A1"><v>1</v></c></row><row r="1048576" customHeight="1"/>'),
    ).toBe('1');
  });

  it('adds no rows for cells that keep a format but hold no value', () => {
    const first = Array.from(
      { length: 10 },
      (_, index) => `<c r="${String.fromCharCode(65 + index)}1"><v>${index}</v></c>`,
    ).join('');

    expect(
      sheetCsv(
        `<row r="1">${first}</row>` +
          '<row r="25000"><c r="A25000" s="1"/></row>' +
          '<row r="30000"><c r="B30000"><v></v></c>' +
          '<c r="C30000" t="inlineStr"><is><t></t></is></c></row>',
      ),
    ).toBe('0,1,2,3,4,5,6,7,8,9');
    expect(
      sheetCsv(
        '<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2" s="1"/></row>' +
          '<row r="3"><c r="A3"><v>3</v></c></row>',
      ),
    ).toBe('1\n\n3');
    expect(sheetCsv('<row r="2"><c r="A2" s="1"/><c r="B2"><v>2</v></c></row>')).toBe(',2');
  });

  it('adds no columns for cells that keep a format but hold no value', () => {
    expect(
      sheetCsv(
        '<row r="1"><c r="A1"><v>1</v></c><c r="ZZZ1" s="1"/></row>' +
          '<row r="2"><c r="B2"><v>2</v></c><c r="C2" t="inlineStr"><is><t></t></is></c></row>',
      ),
    ).toBe('1,\n,2');
    expect(
      sheetCsv('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="A1" s="1"/></row>'),
    ).toBe(',2');
  });

  it('counts the empty rows it keeps against the preview limit', () => {
    const first = '<row r="1"><c><v>0</v></c></row>';
    expect(() => sheetCsv(`${first}<row r="1048576"><c r="A1048576"><v>1</v></c></row>`)).toThrow(
      WorkbookPreviewLimitError,
    );
    expect(() =>
      sheetCsv(`<row r="${'9'.repeat(400)}"><c><v>1</v></c></row><row><c><v>2</v></c></row>`),
    ).toThrow(WorkbookPreviewLimitError);
    expect(() => sheetCsv(`${first}<row r="${'9'.repeat(400)}"><c><v>1</v></c></row>`)).toThrow(
      WorkbookPreviewLimitError,
    );
    expect(() => sheetCsv(`${first}<row r="${MAX_FILE_TEXT_CHARS}"><c><v>1</v></c></row>`)).toThrow(
      WorkbookPreviewLimitError,
    );
    const atLimit = sheetCsv(`${first}<row r="${MAX_FILE_TEXT_CHARS - 1}"><c><v>1</v></c></row>`);
    expect(atLimit).toHaveLength(MAX_FILE_TEXT_CHARS);
    expect(atLimit.startsWith('0\n')).toBe(true);
    expect(atLimit.endsWith('\n1')).toBe(true);
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
  return `<?xml version="1.0"?><styleSheet xmlns="${MAIN_NS}">${
    numFmts ? `<numFmts>${numFmts}</numFmts>` : ''
  }<cellStyleXfs count="2"><xf numFmtId="14"/><xf numFmtId="9"/></cellStyleXfs><cellXfs count="${
    cellFormats.length
  }">${cellFormats
    .map((id) => `<xf numFmtId="${id}" applyNumberFormat="1"><alignment/></xf>`)
    .join(
      '',
    )}</cellXfs><dxfs count="1"><dxf><numFmt numFmtId="14" formatCode="0.00%"/></dxf></dxfs></styleSheet>`;
}

interface StyledCell {
  value: string;
  style?: string;
  type?: string;
}

function styledWorkbook(
  cells: StyledCell[],
  styles: string | null,
  options: { date1904?: boolean; stylesTarget?: string } = {},
): Uint8Array {
  const stylesPath = options.stylesTarget ? `xl/${options.stylesTarget}` : 'xl/styles.xml';
  const members: Record<string, string> = {
    'xl/workbook.xml': `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${
      options.date1904 === undefined
        ? ''
        : `<workbookPr date1904="${options.date1904 ? '1' : '0'}"/>`
    }<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>${
      options.stylesTarget
        ? `<Relationship Id="rId9" Type="${REL_NS}/styles" Target="${options.stylesTarget}"/>`
        : ''
    }</Relationships>`,
    'xl/worksheets/sheet1.xml': sheetXml(
      cells
        .map(
          (cell, index) =>
            `<row r="${index + 1}"><c r="A${index + 1}"${
              cell.style === undefined ? '' : ` s="${cell.style}"`
            }${cell.type ? ` t="${cell.type}"` : ''}><v>${cell.value}</v></c></row>`,
        )
        .join(''),
    ),
  };
  if (styles !== null) members[stylesPath] = styles;
  return workbook(members);
}

function shown(
  cells: StyledCell[],
  styles: string | null,
  options: { date1904?: boolean; stylesTarget?: string } = {},
): string[] {
  const sheets = readWorkbookSheets(styledWorkbook(cells, styles, options));
  return sheets[0]!.csv.split('\n');
}

describe('readWorkbookSheets number formats', () => {
  it('shows a cell with the built-in short date format as an ISO date', () => {
    expect(shown([{ value: '45292', style: '1' }], stylesXml([0, 14]))).toEqual(['2024-01-01']);
  });

  it('counts the 1900 system false leap day like the file does', () => {
    const styles = stylesXml([0, 14]);
    expect(
      shown(
        ['1', '59', '60', '61', '0', '-1'].map((value) => ({ value, style: '1' })),
        styles,
      ),
    ).toEqual(['1900-01-01', '1900-02-28', '1900-02-29', '1900-03-01', '0', '-1']);
  });

  it('reads serials in the 1904 date system when the workbook says so', () => {
    const cells = [
      { value: '43830', style: '1' },
      { value: '0', style: '1' },
    ];
    expect(shown(cells, stylesXml([0, 14]), { date1904: true })).toEqual([
      '2024-01-01',
      '1904-01-01',
    ]);
    expect(shown(cells, stylesXml([0, 14]), { date1904: false })).toEqual(['2019-12-31', '0']);
    expect(shown(cells, stylesXml([0, 14]))).toEqual(['2019-12-31', '0']);
  });

  it('shows a date and time, and a time only, from the fraction of the serial', () => {
    const afternoon = String(45292 + (13 * 3600 + 47 * 60 + 30) / 86400);
    const evening = String(18 / 24);
    expect(
      shown(
        [
          { value: afternoon, style: '1' },
          { value: afternoon, style: '2' },
          { value: afternoon, style: '3' },
          { value: evening, style: '4' },
          { value: afternoon, style: '5' },
          { value: String(45292 + 86399.6 / 86400), style: '3' },
          { value: afternoon, style: '6' },
        ],
        stylesXml([0, 22, 20, 21, 18, 164, 45], { 164: 'yyyy-mm-dd hh:mm:ss' }),
      ),
    ).toEqual([
      '2024-01-01 13:47',
      '13:47',
      '13:47:30',
      '18:00',
      '2024-01-01 13:47:30',
      '00:00:00',
      '13:47:30',
    ]);
  });

  it('rounds to the nearest second before hiding the seconds, and never moves a date alone', () => {
    const almostHalfPast = String(45292 + (10 * 3600 + 30 * 60 + 59.7) / 86400);
    const halfPastAndThirty = String(45292 + (10 * 3600 + 30 * 60 + 30) / 86400);
    const almostMidnight = String(45292 + 86399.7 / 86400);
    expect(
      shown(
        [
          { value: almostHalfPast, style: '1' },
          { value: almostHalfPast, style: '2' },
          { value: halfPastAndThirty, style: '1' },
          { value: almostMidnight, style: '2' },
          { value: almostMidnight, style: '3' },
        ],
        stylesXml([0, 20, 22, 14]),
      ),
    ).toEqual(['10:31', '2024-01-01 10:31', '10:30', '2024-01-02 00:00', '2024-01-01']);
  });

  it('shows percentages with the decimal places of their format', () => {
    expect(
      shown(
        [
          { value: '0', style: '1' },
          { value: '0', style: '2' },
          { value: '0.285', style: '1' },
          { value: '0.12345', style: '2' },
          { value: '-0.5', style: '1' },
        ],
        stylesXml([0, 9, 10]),
      ),
    ).toEqual(['0%', '0.00%', '29%', '12.35%', '-50%']);
  });

  it('shows plain, fixed-decimal and thousands-separated numbers', () => {
    expect(
      shown(
        [
          { value: '1234567.4', style: '1' },
          { value: '-1234.5', style: '2' },
          { value: '1.005', style: '3' },
          { value: '2.5', style: '4' },
          { value: '1234.5', style: '5' },
          { value: '0.5', style: '6' },
          { value: '42', style: '7' },
          { value: '42', style: '0' },
        ],
        stylesXml([0, 3, 4, 2, 1, 164, 165, 166], {
          164: '"$"#,##0.00',
          165: '#.00',
          166: '00000',
        }),
      ),
    ).toEqual(['"1,234,567"', '"-1,234.50"', '1.01', '3', '"$1,234.50"', '.50', '00042', '42']);
  });

  it('keeps letters inside quotes and after a backslash as text when finding dates', () => {
    expect(
      shown(
        [
          { value: '45292', style: '1' },
          { value: '2.5', style: '2' },
          { value: '7', style: '3' },
          { value: '45292', style: '4' },
          { value: '45292', style: '5' },
        ],
        stylesXml([0, 164, 165, 166, 167, 168], {
          164: '"Due "d mmm yyyy',
          165: '0.00" days"',
          166: '0\\h',
          167: '[$-409]mmmm d, yyyy;@',
          168: 'dd.mm.yyyy',
        }),
      ),
    ).toEqual(['2024-01-01', '2.50 days', '7h', '2024-01-01', '2024-01-01']);
  });

  it('shows the stored value for a format it cannot show faithfully', () => {
    const cells = Array.from({ length: 10 }, (_, index) => ({
      value: '12345.678',
      style: String(index + 1),
    }));
    expect(
      shown(
        cells,
        stylesXml([0, 11, 12, 46, 37, 164, 165, 166, 167, 168, 49], {
          164: '[Red]0.00',
          165: '0.00;(0.00)',
          166: '[>100]0;0.0',
          167: '#,##0,',
          168: '0.0#',
        }),
      ),
    ).toEqual(Array.from({ length: 10 }, () => '12345.678'));
    expect(shown([{ value: '-0.001', style: '1' }], stylesXml([0, 2]))).toEqual(['-0.001']);
    expect(shown([{ value: '0x1A', style: '1' }], stylesXml([0, 1]))).toEqual(['0x1A']);
  });

  it('shows the stored value when the style index is not one the file declares', () => {
    expect(
      shown(
        [{ value: '45292', style: '9' }, { value: '45292', style: 'x' }, { value: '45292' }],
        stylesXml([0, 14]),
      ),
    ).toEqual(['45292', '45292', '45292']);
  });

  it('formats only number cells, not text, booleans or uncalculated formulas', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row><c r="A1" s="1" t="str"><v>45292</v></c><c r="B1" s="1" t="b"><v>1</v></c>' +
          '<c r="C1" s="1"><f>TODAY()</f></c><c r="D1" s="1" t="n"><f>A1</f><v>45292</v></c></row>',
      ),
      'xl/styles.xml': stylesXml([0, 14]),
    });
    expect(readWorkbookSheets(bytes)).toEqual([
      { name: 'Sheet1', csv: `45292,1,${XLSX_NOT_CALCULATED},2024-01-01` },
    ]);
  });

  it('finds the styles part through the workbook relationships', () => {
    expect(
      shown([{ value: '0.25', style: '1' }], stylesXml([0, 9]), { stylesTarget: 'theme/s.xml' }),
    ).toEqual(['25%']);
  });

  it('shows stored values when the styles part is missing, broken or oversized', () => {
    const cells = [{ value: '45292', style: '1' }];
    expect(shown(cells, null)).toEqual(['45292']);
    expect(shown(cells, '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/>')).toEqual([
      '45292',
    ]);
    expect(shown(cells, `<!DOCTYPE x>${stylesXml([0, 14])}`)).toEqual(['45292']);
    expect(shown(cells, `<styleSheet>${'<a/>'.repeat(6_000_000)}</styleSheet>`)).toEqual(['45292']);
    expect(
      shown(
        cells,
        `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="${'y'.repeat(
          MAX_FILE_TEXT_CHARS + 1,
        )}"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      ),
    ).toEqual(['45292']);
  });

  it('reads only the custom formats a cell format uses', () => {
    const custom = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [164 + index, `0.${'0'.repeat(index % 5)}" u"`]),
    );
    vi.mocked(parseNumberFormat).mockClear();
    expect(
      shown(
        [
          { value: '2.5', style: '1' },
          { value: '3.5', style: '2' },
        ],
        stylesXml([0, 166, 166, 14], custom),
      ),
    ).toEqual(['2.50 u', '3.50 u']);
    expect(parseNumberFormat).toHaveBeenCalledTimes(1);
  });

  it('shows stored values when the custom format codes pass the preview limit', () => {
    const code = `"${'x'.repeat(250)}"0`;
    const count = Math.ceil(MAX_FILE_TEXT_CHARS / code.length) + 1;
    const custom = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [164 + index, code]),
    );
    custom[164 + count] = 'yyyy-mm-dd';
    expect(shown([{ value: '45292', style: '1' }], stylesXml([0, 164 + count], custom))).toEqual([
      '45292',
    ]);
  });

  it('stops formatting once the shown text passes the preview limit', () => {
    const literal = 'x'.repeat(250);
    const cells = Array.from({ length: 2_000 }, () => ({ value: '1', style: '1' }));
    const bytes = styledWorkbook(cells, stylesXml([0, 164], { 164: `"${literal}"0` }));
    vi.mocked(displayCellNumber).mockClear();
    expect(() => readWorkbookSheets(bytes)).toThrow(WorkbookPreviewLimitError);
    const cellChars = literal.length + 1;
    expect(vi.mocked(displayCellNumber).mock.calls.length).toBeLessThanOrEqual(
      Math.ceil(MAX_FILE_TEXT_CHARS / cellChars) + 1,
    );
  });

  it('shares the shown values as CSV', () => {
    const bytes = workbook({
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row><c r="A1" s="1"><v>45292</v></c><c r="B1" s="2"><v>0.5</v></c>' +
          '<c r="C1" s="3"><v>1234</v></c><c r="D1"><v>7</v></c></row>',
      ),
      'xl/styles.xml': stylesXml([0, 14, 9, 3]),
    });
    expect(readWorkbookSheets(bytes)).toEqual([
      { name: 'Sheet1', csv: '2024-01-01,50%,"1,234",7' },
    ]);
  });
});
