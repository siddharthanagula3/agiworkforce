const SOURCES_HEADING =
  /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources|references|citations|works cited)\s*:?\s*(?:\*\*|__)?\s*$/i;

/**
 * A deep-research report ends with a numbered source list whose entries are raw
 * provider redirect URLs — hundreds of characters each. The Sources panel already
 * lists the same sources by domain, so the tail is duplicated and unreadable.
 * Inline [n] citations stay; only the trailing block goes.
 *
 * Nothing is dropped unless the trailing block is really just that list, so a
 * report whose last section happens to be titled "Sources" but carries prose
 * survives intact.
 */
export function stripTrailingSourceList(markdown: string): string {
  const lines = markdown.split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!SOURCES_HEADING.test(line.trim())) continue;
    if (!isSourceListOnly(lines.slice(index + 1))) return markdown;
    return lines.slice(0, index).join('\n').trimEnd();
  }

  return markdown;
}

function isSourceListOnly(rest: string[]): boolean {
  let entries = 0;
  for (const raw of rest) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:[-*]\s+|\d+[.)]\s+|\[\d+\])/.test(line)) {
      entries += 1;
      continue;
    }
    // A wrapped URL continues the entry above it rather than starting prose.
    if (entries > 0 && !/\s/.test(line)) continue;
    return false;
  }
  return true;
}
