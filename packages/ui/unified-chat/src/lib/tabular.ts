/**
 * Tabular artifact parsing — the ONE place spreadsheet/table/csv artifact
 * content is turned into rows and columns.
 *
 * Real produced artifacts carry either:
 *  - CSV/TSV text (the desktop `create_artifact` tool's documented
 *    "CSV/table data" content for `table`/`spreadsheet` types), or
 *  - a JSON array of objects (the legacy shape the previous renderer
 *    accepted).
 *
 * This module accepts both, with an RFC-4180-ish CSV state machine that
 * handles quoted fields, embedded delimiters/newlines, escaped quotes (`""`),
 * CRLF line endings, a UTF-8 BOM, and ragged rows (short rows are padded,
 * long rows extend the column set). Pure string logic — no DOM, safe on
 * every surface.
 */

export interface TabularData {
  /** Header labels, one per column. */
  columns: string[];
  /** Body rows; every row has exactly `columns.length` cells. */
  rows: string[][];
  /** Per-column: true when every non-empty cell parses as a number. */
  numericColumns: boolean[];
  /** How the content was recognized. */
  source: 'json' | 'delimited';
  /** The delimiter used for `delimited` sources. */
  delimiter?: ',' | '\t' | ';';
}

/** Strip a UTF-8 BOM if present. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Numeric cell detection for alignment/sorting. Accepts plain numbers,
 * thousands separators, a leading currency symbol, a trailing `%`, and
 * parenthesized negatives — the formats models actually emit in tables.
 */
const NUMERIC_CELL_RE =
  /^\(?[-+]?[$€£₹]?\s?\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?%?\)?$|^\(?[-+]?[$€£₹]?\s?\d*\.?\d+(?:[eE][-+]?\d+)?%?\)?$/;

export function isNumericCell(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return NUMERIC_CELL_RE.test(v);
}

/** Extract the comparable number from a numeric-looking cell. NaN if none. */
export function numericValue(value: string): number {
  let v = value.trim();
  if (!v) return NaN;
  const negative = v.startsWith('(') && v.endsWith(')');
  v = v.replace(/[()%$€£₹,\s]/g, '');
  const n = Number(v);
  if (Number.isNaN(n)) return NaN;
  return negative ? -n : n;
}

/** Pick the most plausible delimiter by counting occurrences on the first data line. */
function sniffDelimiter(firstLine: string): ',' | '\t' | ';' {
  const counts: Array<[',' | '\t' | ';', number]> = [
    [',', (firstLine.match(/,/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

/**
 * RFC-4180-ish parser: quoted fields, `""` escapes, embedded delimiters and
 * newlines inside quotes, CRLF/LF endings. Always linear in input length.
 */
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
    } else if (ch === '\n') {
      // handle CRLF: drop a trailing \r from the field
      if (field.endsWith('\r')) field = field.slice(0, -1);
      pushRow();
    } else {
      field += ch;
    }
  }
  // trailing field/row (no final newline)
  if (field !== '' || row.length > 0 || (sawAnything && rows.length === 0)) {
    if (field.endsWith('\r')) field = field.slice(0, -1);
    pushRow();
  }
  // drop fully-empty trailing rows (a final newline should not add a blank row)
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

/** Normalize raw grid rows into TabularData (first row = header, ragged rows squared off). */
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

/**
 * Parse spreadsheet/table/csv artifact content. Tries JSON array-of-objects
 * first (legacy shape), then delimited text. Returns null when the content
 * is not tabular — callers must show an honest raw-content fallback.
 */
export function parseTabular(content: string): TabularData | null {
  const text = stripBom(content ?? '').trim();
  if (!text) return null;

  // 1. JSON array of objects (legacy/API shape)
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

  // 2. Delimited text (CSV/TSV/semicolon)
  const firstLine = text.split('\n', 1)[0] ?? '';
  const delimiter = sniffDelimiter(firstLine);
  const grid = parseDelimited(text, delimiter);
  // A single column with a single row is more plausibly prose than a table.
  if (grid.length < 2 && (grid[0]?.length ?? 0) < 2) return null;
  return fromGrid(grid, 'delimited', delimiter);
}

function stringifyJsonCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Quote a CSV field when needed (RFC 4180). */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize TabularData back to CSV (always comma-delimited). */
export function toCsv(data: TabularData): string {
  const lines = [data.columns.map(csvField).join(',')];
  for (const row of data.rows) lines.push(row.map(csvField).join(','));
  return lines.join('\n');
}

/** Serialize TabularData to a GitHub-flavored markdown table. */
export function toMarkdownTable(data: TabularData): string {
  // Backslashes FIRST, then pipes. Escaping order matters: with pipes first,
  // an input of `a\|b` becomes `a\\|b`, where markdown renders `\\` as a
  // literal backslash and the pipe is left as an unescaped COLUMN SEPARATOR —
  // the cell splits and the table structure breaks. Windows paths and regex
  // literals hit this readily. (js/incomplete-sanitization)
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const header = `| ${data.columns.map(esc).join(' | ')} |`;
  const sep = `| ${data.columns.map(() => '---').join(' | ')} |`;
  const body = data.rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`;
}
