export interface DateTimeFormat {
  kind: 'date';
  date: boolean;
  time: boolean;
  seconds: boolean;
}

export interface DecimalFormat {
  kind: 'number';
  prefix: string;
  suffix: string;
  minIntegerDigits: number;
  decimals: number;
  point: boolean;
  grouped: boolean;
  percent: boolean;
}

export type NumberFormat = DateTimeFormat | DecimalFormat;

type DateLetter = 'y' | 'm' | 'd' | 'h' | 's';

type FormatToken =
  | { kind: 'literal'; text: string }
  | { kind: 'part'; letter: DateLetter; length: number }
  | { kind: 'meridiem' }
  | { kind: 'digit'; character: '0' | '#' | '.' | ',' }
  | { kind: 'percent' }
  | { kind: 'text' };

const MAX_FORMAT_CODE_CHARS = 255;
const MAX_DECIMALS = 30;
const SIGNIFICANT_DIGITS = 15;
const SECONDS_PER_DAY = 86_400;
const MS_PER_DAY = 86_400_000;
const FALSE_LEAP_DAY = 60;
const LAST_DAY_1900 = 2_958_465;
const LAST_DAY_1904 = 2_957_003;
const DISPLAYED_LITERALS = new Set([..."$-+/():!^&'~{}<>= "]);
const STORED_NUMBER_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

// ECMA-376 Part 1, 18.8.30: the built-in formats this module can show. Every other
// built-in id is locale dependent, scientific, fractional, accounting or elapsed time.
const BUILT_IN_CODES: ReadonlyArray<readonly [number, string]> = [
  [1, '0'],
  [2, '0.00'],
  [3, '#,##0'],
  [4, '#,##0.00'],
  [9, '0%'],
  [10, '0.00%'],
  [14, 'mm-dd-yy'],
  [15, 'd-mmm-yy'],
  [16, 'd-mmm'],
  [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'],
  [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'],
  [21, 'h:mm:ss'],
  [22, 'm/d/yy h:mm'],
  [45, 'mm:ss'],
];

function isDateLetter(value: string): value is DateLetter {
  return value === 'y' || value === 'm' || value === 'd' || value === 'h' || value === 's';
}

function scanSections(code: string): FormatToken[][] | null {
  const sections: FormatToken[][] = [[]];
  let index = 0;
  while (index < code.length) {
    const tokens = sections[sections.length - 1]!;
    const character = code[index]!;
    const lower = character.toLowerCase();
    if (character === '"') {
      const close = code.indexOf('"', index + 1);
      if (close === -1) return null;
      tokens.push({ kind: 'literal', text: code.slice(index + 1, close) });
      index = close + 1;
    } else if (character === '\\') {
      if (index + 1 >= code.length) return null;
      tokens.push({ kind: 'literal', text: code[index + 1]! });
      index += 2;
    } else if (character === '[') {
      const close = code.indexOf(']', index + 1);
      if (close === -1 || code[index + 1] !== '$') return null;
      const body = code.slice(index + 2, close);
      const dash = body.indexOf('-');
      const symbol = dash === -1 ? body : body.slice(0, dash);
      if (symbol) tokens.push({ kind: 'literal', text: symbol });
      index = close + 1;
    } else if (character === ';') {
      sections.push([]);
      index += 1;
    } else if (code.slice(index, index + 5).toLowerCase() === 'am/pm') {
      tokens.push({ kind: 'meridiem' });
      index += 5;
    } else if (code.slice(index, index + 3).toLowerCase() === 'a/p') {
      tokens.push({ kind: 'meridiem' });
      index += 3;
    } else if (isDateLetter(lower)) {
      let end = index + 1;
      while (end < code.length && code[end]!.toLowerCase() === lower) end += 1;
      tokens.push({ kind: 'part', letter: lower, length: end - index });
      index = end;
    } else if (character === '0' || character === '#' || character === '.' || character === ',') {
      tokens.push({ kind: 'digit', character });
      index += 1;
    } else if (character === '%') {
      tokens.push({ kind: 'percent' });
      index += 1;
    } else if (character === '@') {
      tokens.push({ kind: 'text' });
      index += 1;
    } else if (DISPLAYED_LITERALS.has(character)) {
      tokens.push({ kind: 'literal', text: character });
      index += 1;
    } else {
      return null;
    }
  }
  return sections;
}

function dateTimeFormat(tokens: readonly FormatToken[]): DateTimeFormat | null {
  const parts: { letter: DateLetter; length: number }[] = [];
  let meridiem = false;
  for (const token of tokens) {
    if (token.kind === 'part') parts.push(token);
    else if (token.kind === 'meridiem') meridiem = true;
    else if (token.kind === 'percent') return null;
    else if (token.kind === 'digit' && (token.character === '0' || token.character === '#')) {
      return null;
    }
  }
  let date = false;
  let time = false;
  let seconds = false;
  let hours = false;
  for (const [index, part] of parts.entries()) {
    if (part.letter === 'y' || part.letter === 'd') {
      date = true;
    } else if (part.letter === 'h') {
      time = true;
      hours = true;
    } else if (part.letter === 's') {
      time = true;
      seconds = true;
    } else if (
      part.length <= 2 &&
      (parts[index - 1]?.letter === 'h' || parts[index + 1]?.letter === 's')
    ) {
      time = true;
    } else {
      date = true;
    }
  }
  if (meridiem && !hours) return null;
  return { kind: 'date', date, time, seconds };
}

function decimalFormat(tokens: readonly FormatToken[]): DecimalFormat | null {
  const first = tokens.findIndex((token) => token.kind === 'digit');
  if (first === -1) return null;
  let last = first;
  while (tokens[last + 1]?.kind === 'digit') last += 1;
  let prefix = '';
  let suffix = '';
  let pattern = '';
  let percent = false;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'digit') {
      if (index > last) return null;
      pattern += token.character;
    } else if (token.kind === 'literal' || token.kind === 'percent') {
      if (token.kind === 'percent') {
        if (percent) return null;
        percent = true;
      }
      const text = token.kind === 'literal' ? token.text : '%';
      if (index < first) prefix += text;
      else suffix += text;
    } else {
      return null;
    }
  }
  if (!pattern.includes('0') && !pattern.includes('#')) return null;
  const point = pattern.indexOf('.');
  if (point !== -1 && pattern.indexOf('.', point + 1) !== -1) return null;
  const integer = point === -1 ? pattern : pattern.slice(0, point);
  const fraction = point === -1 ? '' : pattern.slice(point + 1);
  if (fraction.length > MAX_DECIMALS) return null;
  for (const character of fraction) if (character !== '0') return null;
  let minIntegerDigits = 0;
  let grouped = false;
  for (let index = 0; index < integer.length; index += 1) {
    const character = integer[index]!;
    if (character === '0') {
      minIntegerDigits += 1;
    } else if (character === '#') {
      if (minIntegerDigits > 0) return null;
    } else {
      const next = integer[index + 1];
      if (index === 0 || next === undefined || next === ',') return null;
      grouped = true;
    }
  }
  return {
    kind: 'number',
    prefix,
    suffix,
    minIntegerDigits,
    decimals: fraction.length,
    point: point !== -1,
    grouped,
    percent,
  };
}

/**
 * Reads a spreadsheet number format code. Returns null for anything this module cannot
 * show faithfully: several numeric sections, colours, conditions, fractions, scientific,
 * fill and padding characters, elapsed time, sub-second time and unknown letters.
 */
export function parseNumberFormat(code: string): NumberFormat | null {
  if (code.length === 0 || code.length > MAX_FORMAT_CODE_CHARS) return null;
  const sections = scanSections(code);
  if (!sections) return null;
  const textSection = sections.length > 1 && sections[sections.length - 1]!.some(isText);
  const numeric = textSection ? sections.slice(0, -1) : sections;
  if (numeric.length !== 1) return null;
  const tokens = numeric[0]!;
  if (tokens.some(isText)) return null;
  return tokens.some((token) => token.kind === 'part' || token.kind === 'meridiem')
    ? dateTimeFormat(tokens)
    : decimalFormat(tokens);
}

function isText(token: FormatToken): boolean {
  return token.kind === 'text';
}

let builtIns: ReadonlyMap<number, NumberFormat | null> | null = null;

export function builtInNumberFormat(id: number): NumberFormat | null {
  builtIns ??= new Map(BUILT_IN_CODES.map(([key, code]) => [key, parseNumberFormat(code)]));
  return builtIns.get(id) ?? null;
}

function increment(digits: string): string {
  let index = digits.length - 1;
  while (index >= 0 && digits[index] === '9') index -= 1;
  if (index < 0) return `1${'0'.repeat(digits.length)}`;
  return `${digits.slice(0, index)}${Number(digits[index]) + 1}${'0'.repeat(digits.length - index - 1)}`;
}

function roundToPlaces(
  magnitude: number,
  shift: number,
  decimals: number,
): { whole: string; fraction: string } {
  const [mantissa = '0', exponent = '0'] = magnitude
    .toExponential(SIGNIFICANT_DIGITS - 1)
    .split('e');
  const significant = mantissa.replace('.', '');
  let integerLength = Number(exponent) + 1 + shift;
  const keep = integerLength + decimals;
  if (keep < 0) return { whole: '', fraction: '0'.repeat(decimals) };
  let kept =
    keep >= significant.length
      ? significant + '0'.repeat(keep - significant.length)
      : significant.slice(0, keep);
  if (keep < significant.length && significant[keep]! >= '5') {
    const rounded = increment(kept);
    if (rounded.length > kept.length) integerLength += 1;
    kept = rounded;
  }
  if (integerLength <= 0) return { whole: '', fraction: '0'.repeat(-integerLength) + kept };
  let start = 0;
  while (start < integerLength && kept[start] === '0') start += 1;
  return { whole: kept.slice(start, integerLength), fraction: kept.slice(integerLength) };
}

function groupThousands(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3)
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join(',');
}

function showDecimal(value: number, format: DecimalFormat): string | null {
  const { whole, fraction } = roundToPlaces(
    Math.abs(value),
    format.percent ? 2 : 0,
    format.decimals,
  );
  if (value < 0 && !/[1-9]/.test(whole) && !/[1-9]/.test(fraction)) return null;
  const padded = whole.padStart(format.minIntegerDigits, '0');
  const integer = format.grouped ? groupThousands(padded) : padded;
  return `${value < 0 ? '-' : ''}${format.prefix}${integer}${format.point ? `.${fraction}` : ''}${format.suffix}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function calendarDate(day: number, date1904: boolean): string | null {
  if (!date1904 && day === FALSE_LEAP_DAY) return '1900-02-29';
  if (!date1904 && day < 1) return null;
  const epoch = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, day < FALSE_LEAP_DAY ? 31 : 30);
  const date = new Date(epoch + day * MS_PER_DAY);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

function showDateTime(value: number, format: DateTimeFormat, date1904: boolean): string | null {
  if (value < 0) return null;
  const milliseconds = Math.round(value * MS_PER_DAY);
  let day = Math.floor(milliseconds / MS_PER_DAY);
  const ofDay = milliseconds - day * MS_PER_DAY;
  let seconds = format.time ? Math.round(ofDay / 1000) : Math.floor(ofDay / 1000);
  if (seconds === SECONDS_PER_DAY) {
    day += 1;
    seconds = 0;
  }
  if (day > (date1904 ? LAST_DAY_1904 : LAST_DAY_1900)) return null;
  const shown: string[] = [];
  if (format.date) {
    const date = calendarDate(day, date1904);
    if (!date) return null;
    shown.push(date);
  }
  if (format.time) {
    const clock = `${pad(Math.floor(seconds / 3600), 2)}:${pad(Math.floor(seconds / 60) % 60, 2)}`;
    shown.push(format.seconds ? `${clock}:${pad(seconds % 60, 2)}` : clock);
  }
  return shown.join(' ');
}

/**
 * The text a spreadsheet shows for a stored number under its format, in a locale independent
 * form: ISO 8601 dates, 24-hour times, a period for decimals and a comma between thousands.
 * Returns the stored value unchanged whenever the format or the value cannot be shown faithfully.
 */
export function displayCellNumber(
  stored: string,
  format: NumberFormat | null,
  date1904: boolean,
): string {
  if (!format || !STORED_NUMBER_RE.test(stored)) return stored;
  const value = Number(stored);
  if (!Number.isFinite(value)) return stored;
  const shown =
    format.kind === 'date' ? showDateTime(value, format, date1904) : showDecimal(value, format);
  return shown ?? stored;
}
