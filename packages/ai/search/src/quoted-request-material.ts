const WORD_BEFORE = /[\p{L}\p{N}](?![\s\S])/u;
const WORD_AFTER = /^[\p{L}\p{N}]/u;

export function withoutQuotedRequestMaterial(
  text: string,
  { singleQuotes = false }: { singleQuotes?: boolean } = {},
): string {
  const nextClosing = new Map<string, number>();
  const output: string[] = [];
  let lineEnd = text.indexOf('\n');
  if (lineEnd < 0) lineEnd = text.length;
  let cursor = 0;
  let keepFrom = 0;

  while (cursor < text.length) {
    if (cursor === lineEnd) {
      lineEnd = text.indexOf('\n', cursor + 1);
      if (lineEnd < 0) lineEnd = text.length;
      cursor++;
      continue;
    }
    const opener = text[cursor];
    const single = singleQuotes && opener === "'";
    if (
      (opener !== '"' && opener !== '“' && opener !== '`' && !single) ||
      (single && WORD_BEFORE.test(text.slice(Math.max(0, cursor - 2), cursor)))
    ) {
      cursor++;
      continue;
    }

    const delimiter = opener === '“' ? '”' : opener;
    let closing = nextClosing.get(delimiter);
    // Each delimiter lookup advances; a missing closer never rescans the remaining prompt.
    if (closing === undefined || (closing >= 0 && closing <= cursor)) {
      closing = text.indexOf(delimiter, cursor + 1);
      nextClosing.set(delimiter, closing);
    }
    if (
      closing >= 0 &&
      closing < lineEnd &&
      (!single || (closing > cursor + 1 && !WORD_AFTER.test(text.slice(closing + 1, closing + 3))))
    ) {
      output.push(text.slice(keepFrom, cursor));
      cursor = closing + 1;
      keepFrom = cursor;
    } else {
      cursor++;
    }
  }
  if (keepFrom === 0) return text;
  output.push(text.slice(keepFrom));
  return output.join('');
}
