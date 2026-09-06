const DOLLAR = '$';
const ESCAPED_DOLLAR = '\\$';
const DISPLAY_MATH_FENCE = '$$';
const DIGIT = /\d/u;
const PROSE_WORD = /^[A-Za-z]{2,}$/u;
const TOKEN_PUNCTUATION = /^[*_~(),.;:!?"'`]+|[*_~(),.;:!?"'`]+$/gu;
const PROSE_WORDS_FOR_CURRENCY = 2;

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

export function normalizeMathDelimiters(content: string): string {
  let out = '';
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

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

export function normalizeMarkdownSource(content: string): string {
  return normalizeMathDelimiters(closeUnterminatedCodeFence(content));
}
