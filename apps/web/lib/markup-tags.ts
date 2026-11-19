const TAG_CLOSE = '>';
const ANY_TAG_OPENING = /<[^>]/g;

export interface MarkupTagRange {
  readonly start: number;
  readonly end: number;
}

export function markupTagRanges(text: string, opening: RegExp): MarkupTagRange[] {
  const ranges: MarkupTagRange[] = [];
  let cursor = 0;
  for (const match of text.matchAll(opening)) {
    if (match.index < cursor) continue;
    const close = text.indexOf(TAG_CLOSE, match.index + match[0].length);
    if (close === -1) break;
    ranges.push({ start: match.index, end: close + 1 });
    cursor = close + 1;
  }
  return ranges;
}

export function replaceMarkupTags(text: string, opening: RegExp, replacement: string): string {
  let out = '';
  let cursor = 0;
  for (const { start, end } of markupTagRanges(text, opening)) {
    out += text.slice(cursor, start) + replacement;
    cursor = end;
  }
  return out + text.slice(cursor);
}

export function stripMarkupTags(text: string): string {
  return replaceMarkupTags(text, ANY_TAG_OPENING, '');
}
