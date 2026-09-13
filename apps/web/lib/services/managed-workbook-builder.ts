import 'server-only';

import JSZip from 'jszip';

export interface WorkbookChart {
  type: 'bar' | 'line' | 'pie';
  title: string;
  categoryColumn: string;
  valueColumn: string;
  firstRow: number;
  lastRow: number;
}

export interface WorkbookSheet {
  name: string;
  rows: (string | number)[][];
  chart?: WorkbookChart;
}

const CAT_AXIS_ID = 111_111_111;
const VAL_AXIS_ID = 222_222_222;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLabel(index: number): string {
  let label = '';
  let remaining = index + 1;
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

function cellXml(reference: string, value: string | number): string {
  if (typeof value === 'number') {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  const text = value.trim();
  if (text.startsWith('=')) {
    return `<c r="${reference}"><f>${escapeXml(text.slice(1))}</f></c>`;
  }
  if (text === '') return '';
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: WorkbookSheet, hasDrawing: boolean): string {
  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const body = cells
        .map((value, columnIndex) => cellXml(`${columnLabel(columnIndex)}${rowNumber}`, value))
        .join('');
      return body ? `<row r="${rowNumber}">${body}</row>` : '';
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheetData>${rows}</sheetData>`,
    hasDrawing ? '<drawing r:id="rId1"/>' : '',
    '</worksheet>',
  ].join('');
}

function seriesXml(sheet: WorkbookSheet, chart: WorkbookChart): string {
  const quoted = `'${sheet.name.replace(/'/g, "''")}'`;
  const categories = `${quoted}!$${chart.categoryColumn}$${chart.firstRow}:$${chart.categoryColumn}$${chart.lastRow}`;
  const values = `${quoted}!$${chart.valueColumn}$${chart.firstRow}:$${chart.valueColumn}$${chart.lastRow}`;
  return [
    '<c:ser><c:idx val="0"/><c:order val="0"/>',
    `<c:tx><c:strRef><c:f>${escapeXml(`${quoted}!$${chart.valueColumn}$1`)}</c:f></c:strRef></c:tx>`,
    `<c:cat><c:strRef><c:f>${escapeXml(categories)}</c:f></c:strRef></c:cat>`,
    `<c:val><c:numRef><c:f>${escapeXml(values)}</c:f></c:numRef></c:val>`,
    '</c:ser>',
  ].join('');
}

function plotXml(sheet: WorkbookSheet, chart: WorkbookChart): string {
  const series = seriesXml(sheet, chart);
  if (chart.type === 'pie') {
    return `<c:pieChart><c:varyColors val="1"/>${series}</c:pieChart>`;
  }
  const axes = `<c:axId val="${CAT_AXIS_ID}"/><c:axId val="${VAL_AXIS_ID}"/>`;
  if (chart.type === 'line') {
    return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/>${axes}</c:lineChart>`;
  }
  return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="150"/>${axes}</c:barChart>`;
}

function chartXml(sheet: WorkbookSheet, chart: WorkbookChart): string {
  const axes =
    chart.type === 'pie'
      ? ''
      : [
          `<c:catAx><c:axId val="${CAT_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${VAL_AXIS_ID}"/></c:catAx>`,
          `<c:valAx><c:axId val="${VAL_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${CAT_AXIS_ID}"/></c:valAx>`,
        ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<c:chart>',
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`,
    '<c:autoTitleDeleted val="0"/>',
    `<c:plotArea><c:layout/>${plotXml(sheet, chart)}${axes}</c:plotArea>`,
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>',
    '</c:chart></c:chartSpace>',
  ].join('');
}

function drawingXml(chart: WorkbookChart): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<xdr:twoCellAnchor>',
    `<xdr:from><xdr:col>${Math.max(1, chart.valueColumn.length + 4)}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`,
    '<xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>',
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic>',
    '</xdr:graphicFrame><xdr:clientData/>',
    '</xdr:twoCellAnchor></xdr:wsDr>',
  ].join('');
}

/**
 * A workbook the spreadsheet application opens as a workbook.
 *
 * Written as OOXML parts rather than handed to a sandbox, because the file a
 * reader asks for must not depend on a sandbox being reachable, on the model
 * writing correct library code, or on a package index being online. Formulas
 * stay formulas, every sheet keeps its name, and a requested chart is a real
 * chart part the application renders.
 */
export async function buildWorkbook(sheets: WorkbookSheet[]): Promise<Buffer> {
  const zip = new JSZip();
  const chartSheets = sheets.map((sheet, index) => ({ sheet, index, chart: sheet.chart }));
  const charted = chartSheets.filter((entry) => entry.chart);

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...sheets.map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    ...charted.map(
      (entry) =>
        `<Override PartName="/xl/drawings/drawing${entry.index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
        `<Override PartName="/xl/charts/chart${entry.index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
    ),
    '</Types>',
  ].join('');
  zip.file('[Content_Types].xml', contentTypes);

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );

  zip.file(
    'xl/workbook.xml',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheets>',
      ...sheets.map(
        (sheet, index) =>
          `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      ),
      '</sheets></workbook>',
    ].join(''),
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      ...sheets.map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      ),
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
      '</Relationships>',
    ].join(''),
  );

  zip.file(
    'xl/styles.xml',
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
      '</styleSheet>',
    ].join(''),
  );

  for (const [index, sheet] of sheets.entries()) {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet, Boolean(sheet.chart)));
    if (!sheet.chart) continue;
    zip.file(
      `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${index + 1}.xml"/></Relationships>`,
    );
    zip.file(`xl/drawings/drawing${index + 1}.xml`, drawingXml(sheet.chart));
    zip.file(
      `xl/drawings/_rels/drawing${index + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${index + 1}.xml"/></Relationships>`,
    );
    zip.file(`xl/charts/chart${index + 1}.xml`, chartXml(sheet, sheet.chart));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
