const DOLLAR = '$';
const ESCAPED_DOLLAR = '\\$';
const DISPLAY_MATH_FENCE = '$$';
const DIGIT = /\d/u;
const PROSE_WORD = /^[A-Za-z]{2,}$/u;
const TOKEN_PUNCTUATION = /^[*_~(),.;:!?"'`]+|[*_~(),.;:!?"'`]+$/gu;
const PROSE_WORDS_FOR_CURRENCY = 2;
const TILDE_FENCE_CLOSER = /^ {0,3}(~{3,})[ \t]*\r?$/;

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && DIGIT.test(ch);
}

function readsAsProse(span: string): boolean {
  let words = 0;
  for (const token of span.split(/\s+/u)) {
    if (token.startsWith('\\')) continue;
    if (PROSE_WORD.test(token.replace(TOKEN_PUNCTUATION, ''))) words += 1;
    if (words >= PROSE_WORDS_FOR_CURRENCY) return true;
  }
  return false;
}

function isCurrencyDollar(content: string, open: number): boolean {
  if (!isDigit(content[open + 1])) return false;
  const lineEnd = content.indexOf('\n', open + 1);
  const close = content.indexOf(DOLLAR, open + 1);
  if (close === -1 || (lineEnd !== -1 && close > lineEnd)) return true;
  if (isDigit(content[close + 1])) return true;
  return readsAsProse(content.slice(open + 1, close));
}

function inlineCodeSpanEnd(content: string, open: number): number {
  for (let i = open + 1; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '`') return i;
    if (ch === '\n') return -1;
  }
  return -1;
}

function tildeCodeFenceEnd(content: string, open: number): number {
  if (!content.startsWith('~~~', open) || content[open - 1] === '~') return -1;
  let prefix = open;
  while (prefix > 0 && open - prefix < 3 && content[prefix - 1] === ' ') prefix -= 1;
  if (prefix > 0 && content[prefix - 1] !== '\n') return -1;

  let runEnd = open + 3;
  while (content[runEnd] === '~') runEnd += 1;
  const openingLineEnd = content.indexOf('\n', runEnd);
  if (openingLineEnd === -1) return content.length;
  let lineStart = openingLineEnd + 1;

  while (lineStart < content.length) {
    const next = content.indexOf('\n', lineStart);
    const lineEnd = next === -1 ? content.length : next;
    const closer = TILDE_FENCE_CLOSER.exec(content.slice(lineStart, lineEnd));
    if (closer?.[1] && closer[1].length >= runEnd - open) return lineEnd;
    lineStart = lineEnd + 1;
  }
  return content.length;
}

export function codeRanges(content: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '~') {
      const stop = tildeCodeFenceEnd(content, i);
      if (stop !== -1) {
        ranges.push([i, stop]);
        i = stop;
        continue;
      }
    }
    if (content[i] === '`') {
      if (content.startsWith('```', i)) {
        const end = content.indexOf('```', i + 3);
        const stop = end === -1 ? content.length : end + 3;
        ranges.push([i, stop]);
        i = stop;
        continue;
      }
      const spanEnd = inlineCodeSpanEnd(content, i);
      if (spanEnd !== -1) {
        ranges.push([i, spanEnd + 1]);
        i = spanEnd + 1;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

const TAG_OPENER = /^<(?:\/?[A-Za-z][A-Za-z0-9-]*[\s/>]|!--)/;
const TEX_SPANS = [
  ['\\(', '\\)'],
  ['\\[', '\\]'],
  ['$$', '$$'],
] as const;

function texSpanEnd(text: string, at: number): number {
  for (const [open, close] of TEX_SPANS) {
    if (!text.startsWith(open, at)) continue;
    const end = text.indexOf(close, at + open.length);
    return end === -1 ? -1 : end + close.length;
  }
  return -1;
}

function dollarMathEnd(text: string, open: number): number {
  const close = text.indexOf(DOLLAR, open + 1);
  if (close <= open + 1 || text.slice(open + 1, close).includes('\n')) return -1;
  return /\S/.test(text[open + 1]!) && /\S/.test(text[close - 1]!) && text[close - 1] !== '\\'
    ? close + 1
    : -1;
}

// Outside code and TeX, every tag opener and every dollar that does not open
// a $math$ span is escaped, so "<div>" and "$HOME" read as the words they are.
export function tagsAndDollarsAsText(text: string): string {
  const code = codeRanges(text);
  let out = '';
  let at = 0;
  let range = 0;
  while (at < text.length) {
    const span = code[range];
    if (span && span[0] === at) {
      out += text.slice(span[0], span[1]);
      at = span[1];
      range += 1;
      continue;
    }
    const ch = text[at]!;
    const texEnd = texSpanEnd(text, at);
    const end = texEnd !== -1 ? texEnd : ch === DOLLAR ? dollarMathEnd(text, at) : -1;
    if (end !== -1) {
      out += text.slice(at, end);
      at = end;
    } else if (ch === '\\') {
      out += text.slice(at, at + 2);
      at += 2;
    } else {
      out += (ch === DOLLAR || (ch === '<' && TAG_OPENER.test(text.slice(at))) ? '\\' : '') + ch;
      at += 1;
    }
    while (code[range] && code[range]![0] < at) range += 1;
  }
  return out;
}

export function normalizeMathDelimiters(content: string): string {
  let out = '';
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === '~') {
      const stop = tildeCodeFenceEnd(content, i);
      if (stop !== -1) {
        out += content.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === '`') {
      if (content.startsWith('```', i)) {
        const end = content.indexOf('```', i + 3);
        if (end !== -1) {
          out += content.slice(i, end + 3);
          i = end + 3;
          continue;
        }
      }
      const spanEnd = inlineCodeSpanEnd(content, i);
      if (spanEnd !== -1) {
        out += content.slice(i, spanEnd + 1);
        i = spanEnd + 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      if (content.startsWith('\\[', i)) {
        const end = content.indexOf('\\]', i + 3);
        if (end !== -1) {
          out += `\n\n$$\n${content.slice(i + 2, end)}\n$$\n\n`;
          i = end + 2;
          continue;
        }
      }
      if (content.startsWith('\\(', i)) {
        const end = content.indexOf('\\)', i + 3);
        if (end !== -1) {
          out += `$${content.slice(i + 2, end)}$`;
          i = end + 2;
          continue;
        }
      }
    }

    if (ch === DOLLAR && content[i - 1] !== '\\') {
      if (content.startsWith(DISPLAY_MATH_FENCE, i)) {
        const end = content.indexOf(DISPLAY_MATH_FENCE, i + 2);
        const stop = end === -1 ? i + 2 : end + 2;
        out += content.slice(i, stop);
        i = stop;
        continue;
      }
      if (isCurrencyDollar(content, i)) {
        out += ESCAPED_DOLLAR;
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function closeUnterminatedCodeFence(content: string): string {
  let i = 0;
  while (i < content.length) {
    if (content.startsWith('```', i)) {
      const end = content.indexOf('```', i + 3);
      if (end === -1) {
        return content.endsWith('\n') ? `${content}\`\`\`` : `${content}\n\`\`\``;
      }
      i = end + 3;
      continue;
    }
    i += 1;
  }
  return content;
}

export function markdownItFenceSource(content: string): string {
  return content.replace(/\n$/, '');
}

export function normalizeMarkdownSource(content: string): string {
  return normalizeMathDelimiters(closeUnterminatedCodeFence(content));
}
