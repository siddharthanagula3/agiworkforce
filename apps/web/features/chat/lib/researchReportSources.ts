const SOURCES_HEADING =
  /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources|references|citations|works cited)\s*:?\s*(?:\*\*|__)?\s*$/i;

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

const MARKER_TOKEN = /\[\d{1,3}\]/;
const LINK_TOKEN = /\[[^\]\n]*\]\([^)\n]*\)/;
const MARKER_TOKEN_G = /\[\d{1,3}\]/g;
const LINK_TOKEN_G = /\[[^\]\n]*\]\([^)\n]*\)/g;
const BARE_HOST_TOKEN_G =
  /\(?\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\)?/gi;

function isCitationOnlyLine(raw: string): boolean {
  const line = raw.trim();
  if (!line) return false;
  if (!MARKER_TOKEN.test(line) && !LINK_TOKEN.test(line)) return false;
  const residue = line
    .replace(MARKER_TOKEN_G, '')
    .replace(LINK_TOKEN_G, '')
    .replace(BARE_HOST_TOKEN_G, '')
    .replace(/[()\s,;·|]/g, '');
  return residue.length === 0;
}

export function stripTrailingCitationOnlyBlock(markdown: string): string {
  const lines = markdown.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === '') end -= 1;
  let start = end;
  while (start > 0 && isCitationOnlyLine(lines[start - 1]!)) start -= 1;
  if (start === end) return markdown;
  return lines.slice(0, start).join('\n').trimEnd();
}
