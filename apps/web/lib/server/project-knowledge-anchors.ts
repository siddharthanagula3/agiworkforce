import { MAX_PROJECT_FILE_HEADING_SEGMENTS, type ProjectFileAnchor } from '@agiworkforce/types';

/**
 * Where in a file a passage came from.
 *
 * The store keeps one extracted text per file, not a chunk table, so a passage
 * knows only its character offsets. An anchor list maps those offsets back to
 * something a reader can act on: a page in the original PDF, or the heading a
 * passage sits under in an office, markdown or plain-text file.
 */
export interface KnowledgeAnchor {
  /** Offset into the stored extracted text where this anchor's span begins. */
  start: number;
  /** 1-based page in the source document, for a paginated file. */
  page?: number;
  /** The nearest heading above the offset, for a file that has headings. */
  heading?: string;
  /** Markdown heading depth, 1 for `#`, so a heading trail can be rebuilt. */
  level?: number;
}

export const MAX_KNOWLEDGE_ANCHORS = 500;
const MAX_HEADING_CHARS = 120;
const PAGE_SEPARATOR = '\n\n';
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Join a paginated document's pages into the stored text and record where each
 * page starts. The pages are joined here rather than by the caller because the
 * offsets are only correct if the join and the anchors are computed together.
 */
export function joinPagesWithAnchors(pages: readonly string[]): {
  text: string;
  anchors: KnowledgeAnchor[];
} {
  const anchors: KnowledgeAnchor[] = [];
  const parts: string[] = [];
  let offset = 0;
  pages.forEach((page, index) => {
    const normalized = page.replace(/\r\n?/g, '\n');
    if (!normalized.trim()) return;
    if (parts.length > 0) offset += PAGE_SEPARATOR.length;
    anchors.push({ start: offset, page: index + 1 });
    parts.push(normalized);
    offset += normalized.length;
  });
  return { text: parts.join(PAGE_SEPARATOR), anchors };
}

/** Record every markdown-style heading in the stored text, in document order. */
export function headingAnchors(text: string): KnowledgeAnchor[] {
  const anchors: KnowledgeAnchor[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const match = HEADING_PATTERN.exec(line);
    const heading = match?.[2]?.trim();
    if (heading) {
      anchors.push({
        start: offset,
        heading: heading.slice(0, MAX_HEADING_CHARS),
        level: match?.[1]?.length ?? 1,
      });
      if (anchors.length >= MAX_KNOWLEDGE_ANCHORS) break;
    }
    offset += line.length + 1;
  }
  return anchors;
}

/**
 * Shift anchors onto a text that was trimmed and bounded after they were
 * computed. An anchor that fell outside the surviving text is dropped rather
 * than pointed at the wrong place.
 */
export function rebaseAnchors(
  anchors: readonly KnowledgeAnchor[],
  leadingTrimmed: number,
  boundedLength: number,
): KnowledgeAnchor[] {
  const rebased: KnowledgeAnchor[] = [];
  for (const anchor of anchors) {
    const start = anchor.start - leadingTrimmed;
    if (start < 0 || start >= boundedLength) continue;
    rebased.push({ ...anchor, start });
    if (rebased.length >= MAX_KNOWLEDGE_ANCHORS) break;
  }
  return rebased;
}

/** The anchor covering an offset: the last one that begins at or before it. */
export function anchorAt(
  anchors: readonly KnowledgeAnchor[],
  offset: number,
): KnowledgeAnchor | null {
  return anchors[anchorIndexAt(anchors, offset)] ?? null;
}

function anchorIndexAt(anchors: readonly KnowledgeAnchor[], offset: number): number {
  let found = -1;
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    if (!anchor || anchor.start > offset) break;
    found = index;
  }
  return found;
}

/**
 * Where an offset sits, in the shape a citation chip renders. A page anchor
 * answers on its own; a heading anchor is walked back through its ancestors so
 * the chip can say which section of which section the passage came from.
 */
export function anchorLocationAt(
  anchors: readonly KnowledgeAnchor[],
  offset: number,
): ProjectFileAnchor | null {
  const index = anchorIndexAt(anchors, offset);
  const anchor = anchors[index];
  if (!anchor) return null;
  if (typeof anchor.page === 'number' && anchor.page > 0) return { page: anchor.page };
  if (!anchor.heading) return null;

  const trail = [anchor.heading];
  let depth = anchor.level ?? 1;
  for (
    let back = index - 1;
    back >= 0 && trail.length < MAX_PROJECT_FILE_HEADING_SEGMENTS;
    back -= 1
  ) {
    const ancestor = anchors[back];
    if (!ancestor?.heading) continue;
    const level = ancestor.level ?? 1;
    if (level >= depth) continue;
    trail.unshift(ancestor.heading);
    depth = level;
  }
  return { headingPath: trail };
}

/** How an anchor reads next to a file name: "p. 12", or the heading itself. */
export function formatAnchor(anchor: KnowledgeAnchor | null | undefined): string | null {
  if (!anchor) return null;
  if (typeof anchor.page === 'number' && anchor.page > 0) return `p. ${anchor.page}`;
  return anchor.heading?.trim() || null;
}

export function parseKnowledgeAnchors(value: unknown): KnowledgeAnchor[] {
  if (!Array.isArray(value)) return [];
  const anchors: KnowledgeAnchor[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const start = Number(record['start']);
    if (!Number.isFinite(start) || start < 0) continue;
    const page = Number(record['page']);
    const heading = typeof record['heading'] === 'string' ? record['heading'].trim() : '';
    if (!Number.isFinite(page) && !heading) continue;
    const level = Number(record['level']);
    anchors.push({
      start: Math.trunc(start),
      ...(Number.isFinite(page) && page > 0 ? { page: Math.trunc(page) } : {}),
      ...(heading ? { heading: heading.slice(0, MAX_HEADING_CHARS) } : {}),
      ...(heading && Number.isFinite(level) && level > 0 ? { level: Math.trunc(level) } : {}),
    });
    if (anchors.length >= MAX_KNOWLEDGE_ANCHORS) break;
  }
  return anchors.sort((a, b) => a.start - b.start);
}
