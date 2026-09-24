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

const BODY_MARKER = /(?<!\[)\[(\d{1,3})\](?![(:]|\[(?!\d{1,3}\]))/g;
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;
const NUMBERED_SOURCE_LINE = /^\s*(?:[-*]\s*)?(?:\[(\d{1,3})\]:?|(\d{1,3})[.)])\s+/;
const SOURCE_URL = /https?:\/\/[^\s<>)\]]+/g;
const SOURCE_HEADING_END = /\b(?:sources|references|citations|works cited|urls|links)\s*:?$/i;

interface NumberedSourceLine {
  declared: number;
  text: string;
}

function numberedSourceLines(lines: readonly string[]): NumberedSourceLine[] {
  const entries: NumberedSourceLine[] = [];
  let insideFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE_LINE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const heading = line
      .trim()
      .replace(/^#{1,6}\s*/, '')
      .replaceAll('**', '')
      .replaceAll('__', '')
      .trim();
    if (heading.length > 120 || !SOURCE_HEADING_END.test(heading)) continue;

    const sectionEntries: NumberedSourceLine[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next]?.trim() ?? '';
      if (!candidate) continue;
      if (FENCE_LINE.test(candidate)) break;
      const match = NUMBERED_SOURCE_LINE.exec(candidate);
      if (!match) break;
      sectionEntries.push({
        declared: Number(match[1] ?? match[2]),
        text: candidate,
      });
    }
    entries.push(...sectionEntries);
  }

  return entries;
}

function mapNumberedSources(
  entries: readonly NumberedSourceLine[],
  citations: readonly { url: string }[],
): Map<number, number> | null {
  const mapping = new Map<number, number>();
  for (const entry of entries) {
    const urls = [...entry.text.matchAll(SOURCE_URL)].map((match) =>
      (match[0] ?? '').replace(/[.,;]+$/, ''),
    );
    if (urls.length !== 1) return null;
    const resolved = findCitationIndexForUrl(urls[0]!, citations);
    if (resolved === undefined) return null;
    if (mapping.has(entry.declared) && mapping.get(entry.declared) !== resolved) return null;
    mapping.set(entry.declared, resolved);
  }
  return mapping;
}

export interface ReconciledCitationMarkers {
  markdown: string;
  canLinkNumericCitations: boolean;
}

export function reconcileCitationMarkersFromSourceList(
  markdown: string,
  citations: readonly { url: string }[],
): ReconciledCitationMarkers {
  if (citations.length === 0) return { markdown, canLinkNumericCitations: true };
  const lines = markdown.split('\n');
  const entries = numberedSourceLines(lines);
  if (entries.length === 0) return { markdown, canLinkNumericCitations: true };

  const mapping = mapNumberedSources(entries, citations);
  if (!mapping) return { markdown, canLinkNumericCitations: false };

  let insideFence = false;
  let hasUnmappedMarker = false;
  const rewritten = lines.map((line) => {
    if (FENCE_LINE.test(line)) {
      insideFence = !insideFence;
      return line;
    }
    if (insideFence) return line;
    return line
      .split(/(`+[^`]*`+)/)
      .map((part) => {
        if (part.startsWith('`')) return part;
        return part.replace(BODY_MARKER, (whole, declared: string) => {
          const mapped = mapping.get(Number(declared));
          if (mapped === undefined) {
            hasUnmappedMarker = true;
            return whole;
          }
          return `[${mapped}]`;
        });
      })
      .join('');
  });

  return hasUnmappedMarker
    ? { markdown, canLinkNumericCitations: false }
    : { markdown: rewritten.join('\n'), canLinkNumericCitations: true };
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
const MARKER_TOKEN_G = /\[\d{1,3}\]/g;
const LINK_TOKEN_G = /\[[^\]\n]*\]\([^)\n]*\)/g;
const BARE_HOST_TOKEN_G =
  /\(?\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\)?/gi;

function isCitationOnlyLine(raw: string): boolean {
  const line = raw.trim();
  if (!line) return false;
  if (!MARKER_TOKEN.test(line)) return false;
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
