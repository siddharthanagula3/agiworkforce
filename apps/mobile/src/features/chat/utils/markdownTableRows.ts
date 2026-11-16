import {
  parseInlineMarkdown,
  type InlineNode,
  type InlineParseOptions,
} from './markdownInlineSyntax';

const CELL_DELIMITER = /(?<!\\)\|/;
const ESCAPED_PIPE = /\\\|/g;
const DELIMITER_ROW = /^\s*[\s\-|:]*-[\s\-|:]*$/;
const INLINE_MATH_SPAN =
  /\$\$([^$\n]+?)\$\$|(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)|\\\(([^\n]*?)\\\)/g;
const FRACTION_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const NAMED_OPERATORS = new Set([
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'lim',
  'max',
  'min',
  'det',
  'gcd',
]);
const SILENT_COMMANDS = new Set([
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'displaystyle',
  'textstyle',
  'limits',
  'nolimits',
  'quad',
  'qquad',
  'text',
  'textbf',
  'textit',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'mathbb',
  'mathcal',
  'operatorname',
  'boldsymbol',
  'bar',
  'hat',
  'vec',
  'tilde',
  'dot',
  'overline',
  'underline',
]);
const SYMBOL_ESCAPE = /[{}%&#_$|]/;
const COMMAND_NAME = /^[a-zA-Z]+/;
const TEX_STRUCTURE = '{}^_';

export function isTableRowCandidate(line: string): boolean {
  return line.includes('|') && !line.startsWith('>');
}

export function splitTableRow(line: string): string[] {
  let cells = line.split(CELL_DELIMITER);
  if (cells[0] !== undefined && cells[0].trim() === '') cells = cells.slice(1);
  const last = cells[cells.length - 1];
  if (cells.length > 0 && last !== undefined && last.trim() === '') cells = cells.slice(0, -1);
  return cells.map((cell) => cell.trim().replace(ESCAPED_PIPE, '|'));
}

export function isTableDelimiterRow(line: string, columns: number): boolean {
  return DELIMITER_ROW.test(line) && splitTableRow(line).length === columns;
}

export interface ReadTable {
  readonly rows: readonly (readonly string[])[];
  readonly next: number;
}

function fitToColumns(row: readonly string[], columns: number): string[] {
  return Array.from({ length: columns }, (_, column) => row[column] ?? '');
}

export function readTable(lines: readonly string[], start: number): ReadTable | null {
  const header = lines[start];
  const delimiter = lines[start + 1];
  if (header === undefined || delimiter === undefined || !isTableRowCandidate(header)) return null;
  const headerCells = splitTableRow(header);
  if (headerCells.length === 0 || !isTableDelimiterRow(delimiter, headerCells.length)) return null;
  const rows: string[][] = [headerCells];
  let next = start + 2;
  while (next < lines.length && isTableRowCandidate(lines[next]!)) {
    const row = splitTableRow(lines[next]!);
    if (row.length > 0) rows.push(fitToColumns(row, headerCells.length));
    next += 1;
  }
  return { rows, next };
}

interface TexGroup {
  readonly text: string;
  readonly end: number;
}

function readTexGroup(tex: string, at: number): TexGroup {
  let start = at;
  while (tex[start] === ' ') start += 1;
  if (tex[start] === '{') {
    let depth = 0;
    let end = start;
    for (; end < tex.length; end += 1) {
      if (tex[end] === '\\') end += 1;
      else if (tex[end] === '{') depth += 1;
      else if (tex[end] === '}' && --depth === 0) break;
    }
    return { text: drawnTex(tex.slice(start + 1, end)), end: end + 1 };
  }
  const name = tex[start] === '\\' ? COMMAND_NAME.exec(tex.slice(start + 1))?.[0] : undefined;
  const length = name ? name.length + 1 : tex[start] === '\\' ? 2 : 1;
  const end = Math.min(tex.length, start + length);
  return { text: drawnTex(tex.slice(start, end)), end };
}

function drawnTex(tex: string): string {
  let drawn = '';
  let at = 0;
  while (at < tex.length) {
    const ch = tex[at]!;
    if (ch !== '\\') {
      if (!TEX_STRUCTURE.includes(ch) && ch.trim() !== '') drawn += ch;
      at += 1;
      continue;
    }
    const name = COMMAND_NAME.exec(tex.slice(at + 1))?.[0];
    if (!name) {
      const escaped = tex[at + 1];
      if (escaped !== undefined && SYMBOL_ESCAPE.test(escaped)) drawn += escaped;
      at += 2;
      continue;
    }
    at += name.length + 1;
    if (FRACTION_COMMANDS.has(name)) {
      const numerator = readTexGroup(tex, at);
      const denominator = readTexGroup(tex, numerator.end);
      drawn += numerator.text.length >= denominator.text.length ? numerator.text : denominator.text;
      at = denominator.end;
    } else if (NAMED_OPERATORS.has(name)) {
      drawn += name;
    } else if (!SILENT_COMMANDS.has(name)) {
      drawn += 'x';
    }
  }
  return drawn;
}

/** The text a cell draws once its inline math is typeset, for estimating how wide the cell is. */
export function drawnInlineMath(cell: string): string {
  return cell.replace(INLINE_MATH_SPAN, (_span, double, single, paren) =>
    drawnTex(double ?? single ?? paren ?? ''),
  );
}

function hasLink(nodes: readonly InlineNode[]): boolean {
  return nodes.some(
    (node) => node.type === 'link' || (node.type === 'styled' && hasLink(node.children)),
  );
}

export function tableCellHasLink(cell: string, options: InlineParseOptions = {}): boolean {
  return hasLink(parseInlineMarkdown(cell, options));
}
