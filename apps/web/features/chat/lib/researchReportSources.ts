import { findCitationIndexForUrl } from '@agiworkforce/unified-chat';

const SOURCES_HEADING =
  /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources|references|citations|works cited)\s*:?\s*(?:\*\*|__)?\s*$/i;

/**
 * A deep-research report ends with a numbered source list whose entries are raw
 * provider redirect URLs, hundreds of characters each. The Sources panel already
 * lists the same sources by domain, so the tail is duplicated and unreadable.
 * Inline [n] citations stay; only the trailing block goes.
 *
 * Nothing is dropped unless the trailing block is really just that list, so a
 * report whose last section happens to be titled "Sources" but carries prose
 * survives intact.
 */
const SOURCES_LABEL_WITH_ENTRIES =
  /^(?:\*\*|__)?\s*(?:sources|references|citations|works cited)\s*:\s*(?:\*\*|__)?\s*(\S.*)$/i;

interface TrailingSourceBlock {
  bodyEnd: number;
  entries: string[];
}

function findTrailingSourceBlock(lines: readonly string[]): TrailingSourceBlock | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim();
    const inline = SOURCES_LABEL_WITH_ENTRIES.exec(line);
    if (!SOURCES_HEADING.test(line) && !(inline && isCitationOnlyLine(inline[1]!))) continue;
    const rest = lines.slice(index + 1);
    if (!isSourceListOnly(rest)) return null;
    return { bodyEnd: index, entries: inline ? [inline[1]!, ...rest] : rest };
  }

  return null;
}

export function stripTrailingSourceList(markdown: string): string {
  const lines = markdown.split('\n');
  const block = findTrailingSourceBlock(lines);
  return block ? lines.slice(0, block.bodyEnd).join('\n').trimEnd() : markdown;
}

const NUMBERED_SOURCE_ENTRY =
  /(?:\[(\d{1,3})\]|(?:^|\s)(\d{1,3})[.)])[^\S\n]*<?(https?:\/\/[^\s<>)\]]+)/g;
const BODY_MARKER = /(?<!\])\[(\d{1,3})\](?![([:])/g;
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * A model that writes its own bibliography numbers it by the order it wrote the
 * claims, which is not the order the sources were delivered in, so `[2]` opens
 * whatever happens to sit second in the list rather than the page the sentence
 * came from. The bibliography itself says which URL the model meant, so the
 * markers are remapped onto delivered positions before the tail is stripped.
 *
 * All-or-nothing: one entry that names a page the turn never delivered leaves
 * every marker alone, because a partial remap would silently move the markers
 * it did understand away from the ones it did not.
 */
export function renumberCitationMarkersFromTrailingList(
  markdown: string,
  citations: readonly { url: string }[],
): string {
  if (citations.length === 0) return markdown;
  const lines = markdown.split('\n');
  const block = findTrailingSourceBlock(lines);
  if (!block) return markdown;

  const mapping = new Map<number, number>();
  for (const entry of block.entries) {
    for (const match of entry.matchAll(NUMBERED_SOURCE_ENTRY)) {
      const declared = Number(match[1] ?? match[2]);
      const resolved = findCitationIndexForUrl(match[3]!, citations);
      if (!Number.isInteger(declared) || resolved === undefined) return markdown;
      if ((mapping.get(declared) ?? resolved) !== resolved) return markdown;
      mapping.set(declared, resolved);
    }
  }
  if (mapping.size === 0) return markdown;
  if ([...mapping].every(([declared, resolved]) => declared === resolved)) return markdown;

  let insideFence = false;
  const body = lines.slice(0, block.bodyEnd).map((line) => {
    if (FENCE_LINE.test(line)) {
      insideFence = !insideFence;
      return line;
    }
    if (insideFence) return line;
    return line.replace(BODY_MARKER, (whole, declared: string) => {
      const mapped = mapping.get(Number(declared));
      return mapped === undefined ? whole : `[${mapped}]`;
    });
  });

  return [...body, ...lines.slice(block.bodyEnd)].join('\n');
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
