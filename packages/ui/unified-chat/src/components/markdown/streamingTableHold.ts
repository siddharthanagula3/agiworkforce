const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const DELIMITER_PREFIX_PATTERN = /^[|:\-\s]+$/;
const DELIMITER_CELL_PATTERN = /^:?-+:?$/;

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
    escaped = character === '\\' ? !escaped : false;
  }
  cells.push(cell.trim());
  return cells;
}

function hasUnescapedPipe(line: string): boolean {
  let escaped = false;
  for (const character of line) {
    if (character === '|' && !escaped) return true;
    escaped = character === '\\' ? !escaped : false;
  }
  return false;
}

function lineStartsInsideFence(lines: readonly string[], index: number): boolean {
  let fence: { marker: string; length: number } | null = null;
  for (let position = 0; position < index; position += 1) {
    const match = FENCE_PATTERN.exec(lines[position] ?? '');
    if (!match?.[1]) continue;
    const run = match[1];
    if (!fence) {
      fence = { marker: run[0]!, length: run.length };
    } else if (run[0] === fence.marker && run.length >= fence.length) {
      fence = null;
    }
  }
  return fence !== null;
}

export function holdIncompleteGfmTable(source: string): string {
  if (!source.includes('|')) return source;
  const lines = source.split('\n');
  let last = lines.length - 1;
  if (source.endsWith('\n')) last -= 1;
  if (last < 0 || !lines[last]?.trim()) return source;

  const lastLine = lines[last]!;
  const lastStart = lines.slice(0, last).reduce((length, line) => length + line.length + 1, 0);
  if (lineStartsInsideFence(lines, last)) return source;

  if (hasUnescapedPipe(lastLine) && !DELIMITER_PREFIX_PATTERN.test(lastLine.trim())) {
    return source.slice(0, lastStart);
  }

  if (last === 0 || !DELIMITER_PREFIX_PATTERN.test(lastLine.trim())) return source;
  const header = lines[last - 1]!;
  if (!hasUnescapedPipe(header) || lineStartsInsideFence(lines, last - 1)) return source;
  const headerCells = splitTableCells(header);
  const delimiterCells = splitTableCells(lastLine);
  const complete =
    headerCells.length === delimiterCells.length &&
    delimiterCells.length > 1 &&
    delimiterCells.every((cell) => DELIMITER_CELL_PATTERN.test(cell));
  if (complete) return source;
  const headerStart = lastStart - header.length - 1;
  return source.slice(0, Math.max(0, headerStart));
}
