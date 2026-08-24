export interface TabularData {
  columns: string[];
  rows: string[][];
  numericColumns: boolean[];
  source: 'json' | 'delimited';
  delimiter?: ',' | '\t' | ';';
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const NUMERIC_CELL_RE =
  /^\(?[-+]?[$€£₹]?\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?%?\)?$|^\(?[-+]?[$€£₹]?\s?\d*\.?\d+(?:[eE][-+]?\d+)?%?\)?$/;

const MAX_NUMERIC_CELL_CHARS = 48;

export function isNumericCell(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length > MAX_NUMERIC_CELL_CHARS) return false;
  return NUMERIC_CELL_RE.test(v);
}

export function numericValue(value: string): number {
  let v = value.trim();
  if (!v) return NaN;
  const negative = v.startsWith('(') && v.endsWith(')');
  v = v.replace(/[()%$€£₹,\s]/g, '');
  const n = Number(v);
  if (Number.isNaN(n)) return NaN;
  return negative ? -n : n;
}

function sniffDelimiter(firstLine: string): ',' | '\t' | ';' {
  const counts: Array<[',' | '\t' | ';', number]> = [
    [',', (firstLine.match(/,/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

export function parseDelimited(text: string, delimiter: ',' | '\t' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnything = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    sawAnything = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0 || (sawAnything && rows.length === 0)) {
    pushRow();
  }
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) {
    rows.pop();
  }
  return rows;
}

function computeNumericColumns(columns: string[], rows: string[][]): boolean[] {
  return columns.map((_, colIdx) => {
    let sawValue = false;
    for (const row of rows) {
      const cell = (row[colIdx] ?? '').trim();
      if (!cell) continue;
      sawValue = true;
      if (!isNumericCell(cell)) return false;
    }
    return sawValue;
  });
}

function fromGrid(
  grid: string[][],
  source: TabularData['source'],
  delimiter?: TabularData['delimiter'],
): TabularData | null {
  if (grid.length === 0) return null;
  const width = Math.max(...grid.map((r) => r.length));
  if (width === 0) return null;
  const header = grid[0]!;
  const columns = Array.from({ length: width }, (_, i) => {
    const label = (header[i] ?? '').trim();
    return label || `Column ${i + 1}`;
  });
  const rows = grid.slice(1).map((r) => {
    const cells = r.slice(0, width);
    while (cells.length < width) cells.push('');
    return cells;
  });
  return { columns, rows, numericColumns: computeNumericColumns(columns, rows), source, delimiter };
}

export function parseTabular(content: string): TabularData | null {
  const text = stripBom(content ?? '').trim();
  if (!text) return null;

  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))
      ) {
        const objects = parsed as Record<string, unknown>[];
        const columns: string[] = [];
        for (const obj of objects) {
          for (const key of Object.keys(obj)) {
            if (!columns.includes(key)) columns.push(key);
          }
        }
        if (columns.length === 0) return null;
        const rows = objects.map((obj) => columns.map((c) => stringifyJsonCell(obj[c])));
        return {
          columns,
          rows,
          numericColumns: computeNumericColumns(columns, rows),
          source: 'json',
        };
      }
    } catch {
      /* fall through to delimited */
    }
  }

  const firstLine = text.split('\n', 1)[0] ?? '';
  const delimiter = sniffDelimiter(firstLine);
  const grid = parseDelimited(text, delimiter);
  if (grid.length < 2 && (grid[0]?.length ?? 0) < 2) return null;
  return fromGrid(grid, 'delimited', delimiter);
}

function stringifyJsonCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const CSV_FORMULA_LEAD_RE = /^\s*[=+\-@]/;
const CSV_CONTROL_LEAD_RE = /^[\t\r]/;

// the numeric exemption is only safe for a cell that is a number end to end. Anything a
// number is glued to is attacker-chosen and the importer evaluates the whole cell it read:
// "-1,2+cmd|'/c calc'!A0" is -1.2 plus a DDE reference to a european Excel, and the newline
// in "+1\n+WEBSERVICE(...)" is formula whitespace, not a boundary, once the cell is quoted.
function needsFormulaGuard(value: string, exemptNumeric = true): boolean {
  // a leading tab or CR is the injection vector itself, so it never earns the numeric exemption
  if (CSV_CONTROL_LEAD_RE.test(value)) return true;
  if (!CSV_FORMULA_LEAD_RE.test(value)) return false;
  return !exemptNumeric || !isNumericCell(value);
}

export type SpreadsheetDelimiter = ',' | '\t' | ';';

// an importer commits to one separator before it reads a cell: Excel takes the locale list
// separator, which is ';' across much of Europe, and Google Sheets auto-detects a tab. Each
// choice yields a different set of cells, so a guard has to hold under every one of them.
const FIELD_SEPARATORS = [',', ';', '\t'];

// a cell is quoted when it carries any character an importer could read as a field
// boundary: a european Excel splits .csv on ';' and Google Sheets' import auto-detect
// splits the same bytes on a tab, so an unquoted "deleted; -rf /" or "note\t=1+1" would
// become a cell that starts a formula
const SPREADSHEET_QUOTE_RE = /[",;\t\n\r]/;

// quoting only binds the importer that splits on this document's own delimiter. One that
// splits on a different separator reads our quotes as ordinary text once the cell is not the
// row's first field, then re-splits the cell itself, so every record and field start it would
// carve out of the cell text carries a guard as well.
function guardFieldStarts(
  value: string,
  delimiter: SpreadsheetDelimiter,
  exemptNumeric: boolean,
): string {
  const reSplit = new Set([...FIELD_SEPARATORS, '\r', '\n']);
  reSplit.delete(delimiter);
  let out = '';
  let start = 0;
  const emit = (end: number) => {
    const segment = value.slice(start, end);
    const guarded = needsFormulaGuard(start === 0 ? value : segment, exemptNumeric);
    out += guarded ? `'${segment}` : segment;
  };
  for (let i = 0; i < value.length; i += 1) {
    if (!reSplit.has(value[i]!)) continue;
    emit(i);
    out += value[i]!;
    start = i + 1;
  }
  emit(value.length);
  return out;
}

function spreadsheetField(
  value: string,
  delimiter: SpreadsheetDelimiter,
  exemptNumeric = true,
): string {
  const cell = guardFieldStarts(value, delimiter, exemptNumeric);
  return SPREADSHEET_QUOTE_RE.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

// one cell for a writer whose rows this module never sees. Without the record an importer
// reads, a number cannot be proved harmless: a caller joining "-1" and "2+cmd|'/c calc'!A0"
// hands a european Excel the single cell -1.2 + a DDE reference. So this takes the OWASP
// rule as written and exempts nothing.
export function csvField(value: string): string {
  return spreadsheetField(value, ',', false);
}

function toDelimited(data: TabularData, delimiter: SpreadsheetDelimiter): string {
  const line = (cells: string[]) =>
    cells.map((c) => spreadsheetField(c, delimiter)).join(delimiter);
  // a per-cell guard cannot see the record an importer with another separator reads, so the
  // assembled document goes through the same union pass raw artifact text gets
  return neutralizeSpreadsheetText([line(data.columns), ...data.rows.map(line)].join('\n'));
}

export function toCsv(data: TabularData): string {
  return toDelimited(data, ',');
}

function collectGuards(text: string, start: number, separator: string, guards: Set<number>): void {
  let fieldStart = start;
  let value = '';
  let inQuotes = false;

  const endField = () => {
    if (needsFormulaGuard(value)) {
      // in a quoted cell the apostrophe belongs after the opening quote, or the quoting
      // itself becomes part of the cell text
      guards.add(fieldStart + (text[fieldStart] === '"' ? 1 : 0));
    }
    value = '';
  };

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === '"' && value === '') {
      inQuotes = true;
    } else if (ch === separator || ch === '\r' || ch === '\n') {
      // a lone CR ends a record for Excel, Sheets and python csv alike, so the cell after it
      // is a field start like any other
      endField();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      fieldStart = i + 1;
    } else {
      value += ch;
    }
  }
  endField();
}

// Byte-preserving guard: the only edit is an apostrophe inserted ahead of a cell a
// spreadsheet would evaluate, so the delimiter, spacing, blank rows, trailing newline
// and CRLF of the original content all survive the export.
export function neutralizeSpreadsheetText(content: string): string {
  const text = content ?? '';
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const guards = new Set<number>();
  for (const separator of FIELD_SEPARATORS) collectGuards(text, start, separator, guards);
  if (guards.size === 0) return text;

  let out = '';
  let copied = 0;
  // an apostrophe never opens or closes a field, so inserting one cannot move the cell
  // boundaries the other separators were measured against
  for (const at of [...guards].sort((a, b) => a - b)) {
    out += `${text.slice(copied, at)}'`;
    copied = at;
  }
  return out + text.slice(copied);
}

const TAB_DELIMITED_EXPORTS = new Set(['tsv', 'tab']);

// every extension a spreadsheet opens as text and evaluates formulas in, including the
// SYLK/DIF/OpenDocument names a model can pick as an artifact language
const SPREADSHEET_EXPORTS = new Set([
  'csv',
  'tsv',
  'tab',
  'prn',
  'slk',
  'sylk',
  'dif',
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'xlt',
  'xltx',
  'xltm',
  'xlam',
  'xla',
  'xlw',
  'ods',
  'ots',
  'fods',
  'uos',
]);

/**
 * Trims trailing dots and whitespace in one linear pass.
 *
 * The obvious `/[\s.]+$/` is a polynomial-ReDoS shape: anchored at the end with
 * a repeated character class, it backtracks quadratically over a long run that
 * does not ultimately match. The input here is a model-chosen filename
 * extension, so its length is not ours to bound, and a scan is both safe and
 * cheaper than the regex it replaces.
 */
function stripTrailingDotsAndWhitespace(value: string): string {
  let end = value.length;
  while (end > 0) {
    const code = value.charCodeAt(end - 1);
    const isDot = code === 46;
    const isSpace = code === 32 || (code >= 9 && code <= 13) || code === 160 || code === 0xfeff;
    if (!isDot && !isSpace) break;
    end -= 1;
  }
  return value.slice(0, end);
}

export function spreadsheetExportDelimiter(
  extension: string | null | undefined,
): SpreadsheetDelimiter | null {
  // a model-chosen language of "foo.csv" still lands a .csv on disk, so what a
  // spreadsheet acts on is the last dot-separated segment, not the whole string, and
  // Windows drops the trailing dots and spaces of "csv." before the file is created
  const normalized =
    stripTrailingDotsAndWhitespace((extension ?? '').toLowerCase())
      .split('.')
      .pop()
      ?.trim() ?? '';
  if (!SPREADSHEET_EXPORTS.has(normalized)) return null;
  return TAB_DELIMITED_EXPORTS.has(normalized) ? '\t' : ',';
}

export interface SpreadsheetSafeExport {
  body: string;
  mimeType: string;
}

// a JSON array-of-objects artifact is rendered as a grid, never as its literal text, so a
// spreadsheet-named download owes the user real rows; delimited text is guarded in place
function jsonTable(content: string): TabularData | null {
  const text = stripBom(content ?? '').trimStart();
  if (!text.startsWith('[')) return null;
  const parsed = parseTabular(content);
  return parsed?.source === 'json' ? parsed : null;
}

export function spreadsheetSafeExport(
  content: string,
  extension: string | null | undefined,
): SpreadsheetSafeExport {
  const delimiter = spreadsheetExportDelimiter(extension);
  if (!delimiter) return { body: content, mimeType: 'text/plain' };
  const mimeType =
    delimiter === '\t' ? 'text/tab-separated-values;charset=utf-8;' : 'text/csv;charset=utf-8;';
  const json = jsonTable(content);
  return {
    body: json ? toDelimited(json, delimiter) : neutralizeSpreadsheetText(content),
    mimeType,
  };
}

export function toMarkdownTable(data: TabularData): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const header = `| ${data.columns.map(esc).join(' | ')} |`;
  const sep = `| ${data.columns.map(() => '---').join(' | ')} |`;
  const body = data.rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`;
}
