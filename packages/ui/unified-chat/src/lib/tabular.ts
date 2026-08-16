
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
    } else if (ch === '\n') {
      if (field.endsWith('\r')) field = field.slice(0, -1);
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0 || (sawAnything && rows.length === 0)) {
    if (field.endsWith('\r')) field = field.slice(0, -1);
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

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(data: TabularData): string {
  const lines = [data.columns.map(csvField).join(',')];
  for (const row of data.rows) lines.push(row.map(csvField).join(','));
  return lines.join('\n');
}

export function toMarkdownTable(data: TabularData): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const header = `| ${data.columns.map(esc).join(' | ')} |`;
  const sep = `| ${data.columns.map(() => '---').join(' | ')} |`;
  const body = data.rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`;
}
