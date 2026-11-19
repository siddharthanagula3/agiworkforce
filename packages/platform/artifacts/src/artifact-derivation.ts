/**
 * Artifact Derivation Service (canonical, cross-surface)
 *
 * The ONE place artifacts are derived from message content. Web, desktop, and
 * mobile all consume this instead of their own forked copies
 * (`apps/web/.../artifact-detector.ts`, `apps/mobile/.../artifacts/store.ts`).
 *
 * Two properties make this the canonical home:
 *
 *  1. DETERMINISTIC IDENTITY. Every surface computes the SAME id for the same
 *     derived artifact: `derived_id = uuidv5(conversationId:messageId:ordinal)`.
 *     The forked web copy used `Date.now()` + `crypto.randomUUID()`, a fresh id
 *     on every render, which is precisely why derived artifacts could not be
 *     de-duplicated or cloud-synced across devices. This module fixes that
 *     (see docs/plans/artifact-cloud-sync-design-2026-06-21.md §4 and
 *     docs/plans/shared-packages-consolidation-plan-2026-06-21.md §3).
 *
 *  2. PLATFORM-AGNOSTIC OUTPUT. Returns `SharedArtifact` (from
 *     `@agiworkforce/types`), which each surface maps to its own view type
 *     (web `ArtifactData`, mobile `MobileArtifact`). No DOM, no RN, safe to
 *     import from all three surfaces.
 *
 * Inclusion policy is parameterized because the surfaces legitimately differ:
 *  - web shows only *renderable* artifacts (html/react/svg/mermaid/marked);
 *  - mobile's gallery shows *all* code blocks with >= `minCodeLines` lines.
 * Both are expressed via `include`.
 *
 * @module artifact-derivation
 */

import { v5 as uuidv5 } from 'uuid';
import type { SharedArtifact, SharedArtifactType } from '@agiworkforce/types';

export const DERIVED_ARTIFACT_NAMESPACE = '5f6c1e8a-2b3d-4c5e-8f9a-0b1c2d3e4f50';
export const EXPLICIT_ARTIFACT_DERIVATION_POLICY = 'explicit-v1' as const;
export type ArtifactDerivationPolicy = typeof EXPLICIT_ARTIFACT_DERIVATION_POLICY;

export interface DerivedCodeBlock {
  language: string;
  content: string;
  startIndex: number;
  endIndex: number;
  ordinal: number;
  lineCount: number;
}

const FENCE_OPEN_LINE = /^(`{3,})([^`]*)$/;
const FENCE_CLOSE_LINE = /^(`{3,})\s*$/;

function parseFenceLanguage(info: string | undefined): string {
  return (info ?? '').trim().split(/\s+/)[0]?.toLowerCase() || 'text';
}

interface MarkdownLine {
  text: string;
  start: number;
}

function markdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = 0;
  while (start <= markdown.length) {
    const newline = markdown.indexOf('\n', start);
    const end = newline === -1 ? markdown.length : newline;
    const raw = markdown.slice(start, end);
    lines.push({ text: raw.endsWith('\r') ? raw.slice(0, -1) : raw, start });
    if (newline === -1) break;
    start = newline + 1;
  }
  return lines;
}

// A marked document wrapped in a fence often holds blocks fenced with the same
// three backticks. Inside one, a fence line with an info string opens a nested
// block whose bare fence closes it, so only a bare fence at depth zero closes
// the document.
export function extractCodeBlocks(markdown: string): DerivedCodeBlock[] {
  const blocks: DerivedCodeBlock[] = [];
  const lines = markdownLines(markdown);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const open = FENCE_OPEN_LINE.exec(line.text);
    if (!open || index + 1 >= lines.length) {
      index += 1;
      continue;
    }
    const fenceLength = open[1]!.length;
    const nests = isArtifactMarkerLine(lines[index + 1]!.text.trim());
    let depth = 0;
    let close = index + 1;
    for (; close < lines.length; close += 1) {
      const text = lines[close]!.text;
      const closing = FENCE_CLOSE_LINE.exec(text);
      if (closing) {
        if (depth > 0) depth -= 1;
        else if (closing[1]!.length >= fenceLength) break;
      } else if (nests && FENCE_OPEN_LINE.exec(text)?.[2]?.trim()) {
        depth += 1;
      }
    }
    if (close >= lines.length) break;
    const content = markdown.slice(lines[index + 1]!.start, lines[close]!.start).trim();
    blocks.push({
      language: parseFenceLanguage(open[2]),
      content,
      startIndex: line.start,
      endIndex: lines[close]!.start + FENCE_CLOSE_LINE.exec(lines[close]!.text)![1]!.length,
      ordinal: blocks.length,
      lineCount: content.split('\n').filter((l) => l.trim().length > 0).length,
    });
    index = close + 1;
  }
  return blocks;
}

export function isRenderableArtifact(language: string, content: string): boolean {
  const lang = language.toLowerCase();
  if (MARKDOWN_LANGUAGES.has(lang)) return isMarkedMarkdownDocument(lang, content);
  if (lang === 'html' || lang === 'htm') return true;
  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') return true;
  if (lang === 'svg' || content.trim().startsWith('<svg')) return true;
  if (lang === 'mermaid') return true;
  if (
    content.includes('<!DOCTYPE') ||
    content.includes('<html') ||
    (content.includes('<div') && content.includes('</div>'))
  ) {
    return true;
  }
  return (
    content.includes('// @artifact') ||
    content.includes('<!-- @artifact -->') ||
    content.includes('# @artifact')
  );
}

export const EXPLICIT_ARTIFACT_MARKERS = [
  '// @artifact',
  '<!-- @artifact -->',
  '# @artifact',
  '%% @artifact',
] as const;

export const EXPLICIT_ARTIFACT_MARKER_FOR = {
  html: EXPLICIT_ARTIFACT_MARKERS[1],
  svg: EXPLICIT_ARTIFACT_MARKERS[1],
  react: EXPLICIT_ARTIFACT_MARKERS[0],
  mermaid: EXPLICIT_ARTIFACT_MARKERS[3],
  markdown: EXPLICIT_ARTIFACT_MARKERS[1],
} as const;

const MARKDOWN_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'md']);
const DECK_LINE = /^\s*<!--\s*deck\b[^>]*-->\s*$/m;

export function isMarkedMarkdownDocument(language: string, content: string): boolean {
  if (!MARKDOWN_LANGUAGES.has(language.toLowerCase())) return false;
  const firstLine = content.split('\n', 1)[0] ?? '';
  return firstLine.trim() === EXPLICIT_ARTIFACT_MARKER_FOR.markdown;
}

function stripMarkdownMarker(content: string): string {
  const newline = content.indexOf('\n');
  return newline === -1 ? '' : content.slice(newline + 1).trim();
}

function isArtifactMarkerLine(trimmedLine: string): boolean {
  return EXPLICIT_ARTIFACT_MARKERS.some((marker) => trimmedLine === marker);
}

export function withoutArtifactMarker(content: string): string {
  const newline = content.indexOf('\n');
  const firstLine = newline === -1 ? content : content.slice(0, newline);
  if (!isArtifactMarkerLine(firstLine.trim())) return content;
  return newline === -1 ? '' : content.slice(newline + 1);
}

export function hasExplicitArtifactMarker(content: string): boolean {
  return EXPLICIT_ARTIFACT_MARKERS.some((marker) => content.includes(marker));
}

export function isExplicitlyRenderableArtifact(language: string, content: string): boolean {
  if (isMarkedMarkdownDocument(language, content)) return true;
  return isRenderableArtifact(language, content) && hasExplicitArtifactMarker(content);
}

export function detectArtifactType(language: string, content: string): SharedArtifactType {
  if (isMarkedMarkdownDocument(language, content)) {
    return DECK_LINE.test(stripMarkdownMarker(content)) ? 'presentation' : 'document';
  }
  const lang = language.toLowerCase();
  if (MARKDOWN_LANGUAGES.has(lang)) return 'code';
  if (lang === 'mermaid') return 'mermaid';
  if (lang === 'svg' || content.trim().startsWith('<svg')) return 'svg';
  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') return 'react';
  if (lang === 'html' || lang === 'htm') return 'html';
  if (
    content.includes('<!DOCTYPE') ||
    content.includes('<html') ||
    (content.includes('<div') && content.includes('</div>'))
  ) {
    return 'html';
  }
  return 'code';
}

const MAX_TITLE_CHARS = 60;
const TITLE_DIRECTIVE = /(?:\/\/|<!--|#)\s*@title:?\s*/i;
const TITLE_DIRECTIVE_LINE = new RegExp(`^${TITLE_DIRECTIVE.source}`, 'i');
const TABULAR_LANGUAGES: ReadonlySet<string> = new Set(['csv', 'tsv']);

function isTabularLanguage(language: string | undefined): boolean {
  return TABULAR_LANGUAGES.has(language?.trim().toLowerCase() ?? '');
}

export function withoutTitleDirectives(content: string): string {
  return content
    .split('\n')
    .filter((line) => !TITLE_DIRECTIVE_LINE.test(line.trim()))
    .join('\n');
}

function extractTitleComment(content: string): string | undefined {
  const marker = TITLE_DIRECTIVE.exec(content);
  if (!marker) return undefined;
  const start = marker.index + marker[0].length;
  const newline = content.indexOf('\n', start);
  const commentEnd = content.indexOf('-->', start);
  const candidates = [newline, commentEnd].filter((i) => i !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : content.length;
  const value = content.slice(start, end).trim();
  return value || undefined;
}

function betweenTags(content: string, openTag: string, closeTag: string): string | undefined {
  const lower = content.toLowerCase();

  const nameAt = lower.indexOf(openTag);
  if (nameAt === -1) return undefined;

  let cursor = nameAt + openTag.length;
  while (cursor < content.length && content[cursor] !== '>') cursor += 1;
  if (cursor >= content.length) return undefined;

  const start = cursor + 1;
  const end = lower.indexOf(closeTag, start);
  return end === -1 ? undefined : content.slice(start, end);
}

function stripTags(text: string): string {
  let out = '';
  let cursor = 0;
  for (let open = text.indexOf('<'); open !== -1; open = text.indexOf('<', cursor)) {
    const close = text.indexOf('>', open + 1);
    if (close === -1) break;
    out += text.slice(cursor, open);
    cursor = close + 1;
  }
  return out + text.slice(cursor);
}

const TITLE_FENCE_LINE = /^(?:`{3,}|~{3,})/;
const MARKDOWN_HEADING_LINE = /^#{1,6}\s+\S/;

function titleCandidateLines(content: string): string[] {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const marker = TITLE_FENCE_LINE.exec(trimmed)?.[0];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null || trimmed.length === 0 || isArtifactMarkerLine(trimmed)) continue;
    lines.push(trimmed);
  }
  return lines;
}

function usableTitle(text: string): string | undefined {
  return text.length > 2 && text.length <= MAX_TITLE_CHARS ? text : undefined;
}

function explicitArtifactTitle(content: string, language?: string): string | undefined {
  const titleText = betweenTags(content, '<title', '</title>');
  if (titleText?.trim()) return titleText.trim();

  const commentText = extractTitleComment(content);
  if (commentText) return commentText;

  const headingText = betweenTags(content, '<h1', '</h1>');
  if (headingText) {
    let text: string = headingText;
    let prev: string;
    do {
      prev = text;
      text = stripTags(text);
    } while (text !== prev);
    const trimmed = text.trim();
    if (trimmed) return trimmed;
  }

  if (language === undefined || !MARKDOWN_LANGUAGES.has(language.toLowerCase())) return undefined;
  const heading = titleCandidateLines(content).find((line) => MARKDOWN_HEADING_LINE.test(line));
  return (heading && usableTitle(heading.replace(/^#+\s+/, '').trim())) || undefined;
}

function firstLineTitle(content: string): string | undefined {
  const first = titleCandidateLines(content).find((line) => !line.startsWith('<')) ?? '';
  return usableTitle(
    first
      .replace(/^#+\s+/, '')
      .replace(/^\/\/+\s*/, '')
      .trim(),
  );
}

export function extractArtifactTitle(content: string, language?: string): string | undefined {
  return (
    explicitArtifactTitle(content, language) ??
    (isTabularLanguage(language) ? undefined : firstLineTitle(content))
  );
}

// em-dash-allow: a model writes it between a title and its counter
const COUNTER_SEPARATORS = '\\s:\\-\\u2013\\u2014|\\u00b7,.';

function counterPattern(nouns: string, abbreviation?: string): RegExp {
  const position = '\\s*#?\\s*\\d{1,3}\\s*';
  const spelled = `(?:${nouns})${position}(?:of|out\\s+of|/)`;
  const prefix = abbreviation
    ? `(?:${spelled}|${abbreviation}${position}(?:of|out\\s+of))`
    : spelled;
  const counter = `${prefix}\\s*\\d{1,3}\\b`;
  return new RegExp(
    `^[${COUNTER_SEPARATORS}(\\[]*${counter}[${COUNTER_SEPARATORS})\\]]*|(?:^|[${COUNTER_SEPARATORS}(\\[]+)${counter}[${COUNTER_SEPARATORS})\\]]*$`,
    'gi',
  );
}

const QUIZ_COUNTER = counterPattern('question', 'q');
const CARD_COUNTER = counterPattern('flashcard|card');

/**
 * A model sometimes writes its own position counter into a title ("Cells:
 * Question 1 of 2"); every view counts the entries the set actually holds, so
 * the written one is dropped. A year is not a total, so "Q1 of 2025" and
 * "Q4/24" stay.
 */
export function withoutQuizCounter(title: string): string {
  return title.replace(QUIZ_COUNTER, '').trim();
}

export function withoutFlashcardsCounter(title: string): string {
  return title.replace(CARD_COUNTER, '').trim();
}

const STUDY_SETS = {
  quiz: { entries: 'questions', label: 'Quiz', withoutCounter: withoutQuizCounter },
  flashcards: { entries: 'cards', label: 'Flashcards', withoutCounter: withoutFlashcardsCounter },
} as const;
type StudySetKind = keyof typeof STUDY_SETS;
const STUDY_FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*([a-z-]+)[ \t]*$/i;
const STUDY_FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

function isStudySetKind(value: string): value is StudySetKind {
  return value === 'quiz' || value === 'flashcards';
}

function studySetSourceTitle(kind: StudySetKind, source: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  const { entries, label, withoutCounter } = STUDY_SETS[kind];
  const root = Array.isArray(parsed) ? { [entries]: parsed } : parsed;
  if (!root || typeof root !== 'object') return undefined;
  const set = root as Record<string, unknown>;
  const items = set[entries];
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const title =
    typeof set['title'] === 'string'
      ? withoutCounter(set['title'].replace(/\s+/g, ' ').trim())
      : '';
  return title && title.length <= MAX_TITLE_CHARS ? title : label;
}

function studySetTitle(
  language: string,
  content: string,
  markedDocument: boolean,
): string | undefined {
  const fence = language.toLowerCase();
  if (isStudySetKind(fence)) return studySetSourceTitle(fence, content);
  if (!markedDocument) return undefined;
  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  for (let index = 0; index < lines.length; index += 1) {
    const open = STUDY_FENCE_OPEN.exec(lines[index]!);
    const kind = open?.[2]?.toLowerCase() ?? '';
    if (!open || !isStudySetKind(kind)) continue;
    const marker = open[1]!;
    let close = index + 1;
    while (close < lines.length) {
      const run = STUDY_FENCE_CLOSE.exec(lines[close]!)?.[1];
      if (run && run[0] === marker[0] && run.length >= marker.length) break;
      close += 1;
    }
    const title = studySetSourceTitle(kind, lines.slice(index + 1, close).join('\n'));
    if (title) return title;
    index = close;
  }
  return undefined;
}

export function computeDerivedArtifactId(
  conversationId: string | undefined,
  messageId: string | undefined,
  ordinal: number,
): string {
  return uuidv5(
    `${conversationId ?? ''}:${messageId ?? ''}:${ordinal}`,
    DERIVED_ARTIFACT_NAMESPACE,
  );
}

export interface TrailingUnclosedBlock {
  language: string;
  content: string;
  /**
   * The ordinal this block WILL have once the fence closes (= count of
   * complete blocks before it). Feeding this to
   * {@link computeDerivedArtifactId} yields the SAME id the completed
   * artifact will get, enabling a seamless streaming → persisted handoff.
   */
  ordinal: number;
  startIndex: number;
}

const OPEN_FENCE_RE = /^`{3,}([^\n`]*)\r?\n/m;

export function extractTrailingUnclosedBlock(
  markdown: string,
  blocks: DerivedCodeBlock[] = extractCodeBlocks(markdown),
): TrailingUnclosedBlock | null {
  const tailStart = blocks.length > 0 ? blocks[blocks.length - 1]!.endIndex : 0;
  const tail = markdown.slice(tailStart);

  const open = OPEN_FENCE_RE.exec(tail);
  if (!open) return null;

  return {
    language: parseFenceLanguage(open[1]),
    content: tail.slice(open.index + open[0].length),
    ordinal: blocks.length,
    startIndex: tailStart + open.index,
  };
}

export type ArtifactInclusion =
  'renderable' | 'explicit-renderable' | 'code' | ((block: DerivedCodeBlock) => boolean);

export function artifactInclusionForPolicy(policy: unknown): ArtifactInclusion {
  return policy === EXPLICIT_ARTIFACT_DERIVATION_POLICY ? 'explicit-renderable' : 'renderable';
}

export interface DeriveArtifactsOptions {
  conversationId?: string;
  messageId?: string;
  include?: ArtifactInclusion;
  minCodeLines?: number;
  now?: string;
  blocks?: DerivedCodeBlock[];
}

function blockIncluded(
  block: DerivedCodeBlock,
  include: ArtifactInclusion,
  minCodeLines: number,
): boolean {
  if (typeof include === 'function') return include(block);
  if (include === 'code') return block.lineCount >= minCodeLines;
  if (include === 'explicit-renderable') {
    return isExplicitlyRenderableArtifact(block.language, block.content);
  }
  return (
    isRenderableArtifact(block.language, block.content) ||
    isMarkedMarkdownDocument(block.language, block.content)
  );
}

export function deriveArtifacts(
  markdown: string,
  options: DeriveArtifactsOptions = {},
): SharedArtifact[] {
  const { conversationId, messageId, include = 'renderable', minCodeLines = 4, blocks } = options;
  const now = options.now ?? new Date().toISOString();

  const artifacts: SharedArtifact[] = [];
  for (const block of blocks ?? extractCodeBlocks(markdown)) {
    if (!blockIncluded(block, include, minCodeLines)) continue;
    const markedDocument = isMarkedMarkdownDocument(block.language, block.content);
    const content = markedDocument ? stripMarkdownMarker(block.content) : block.content;
    const type = detectArtifactType(block.language, block.content);
    const titleLanguage = markedDocument ? 'markdown' : block.language;
    artifacts.push({
      id: computeDerivedArtifactId(conversationId, messageId, block.ordinal),
      type,
      title:
        explicitArtifactTitle(content, titleLanguage) ??
        (type === 'presentation'
          ? undefined
          : studySetTitle(block.language, content, markedDocument)) ??
        (isTabularLanguage(block.language) ? undefined : firstLineTitle(content)) ??
        defaultTitle(block, markedDocument),
      content,
      language: markedDocument ? 'markdown' : block.language,
      version: 1,
      createdAt: now,
      updatedAt: now,
      conversationId,
      messageId,
      metadata: { ordinal: block.ordinal, derived: true },
    });
  }
  return artifacts;
}

export function artifactKindLabel(type: string): string {
  switch (type) {
    case 'html':
    case 'react':
    case 'svg':
    case 'mermaid':
    case 'code':
      return 'Code';
    case 'spreadsheet':
    case 'csv':
    case 'table':
      return 'Spreadsheet';
    case 'presentation':
      return 'Slides';
    case 'email':
      return 'Email';
    case 'image':
      return 'Image';
    case 'document':
    default:
      return 'Document';
  }
}

function defaultTitle(block: DerivedCodeBlock, markedDocument: boolean): string {
  if (markedDocument) return artifactKindLabel(detectArtifactType(block.language, block.content));
  if (isTabularLanguage(block.language)) return artifactKindLabel('csv');
  const lang =
    block.language && block.language !== 'text' ? `${block.language} snippet` : 'Code snippet';
  return block.ordinal === 0 ? lang : `${lang} ${block.ordinal + 1}`;
}

export function hasArtifacts(markdown: string, options: DeriveArtifactsOptions = {}): boolean {
  const { include = 'renderable', minCodeLines = 4 } = options;
  return extractCodeBlocks(markdown).some((b) => blockIncluded(b, include, minCodeLines));
}

export interface ArtifactProseSplit {
  before: string;
  after: string;
}

export type ArtifactProseOptions = Pick<DeriveArtifactsOptions, 'include' | 'minCodeLines'> & {
  keepInline?: (block: DerivedCodeBlock) => boolean;
};

/**
 * The prose on either side of the last artifact block, with every artifact
 * block removed, so a surface can show the artifact where the model put it
 * instead of after the whole reply. `after` is empty when nothing follows.
 */
export function splitProseAroundArtifacts(
  markdown: string,
  artifacts: ReadonlyArray<Pick<SharedArtifact, 'content' | 'language'>>,
  options: ArtifactProseOptions = {},
): ArtifactProseSplit {
  if (artifacts.length === 0) return { before: markdown.trim(), after: '' };
  const wanted = new Set(artifacts.map((a) => normalizeWhitespace(a.content)));
  const blocks = extractCodeBlocks(markdown);
  let lastEnd = -1;
  for (const block of blocks) {
    if (options.keepInline?.(block)) continue;
    if (
      wanted.has(normalizeWhitespace(block.content)) ||
      blockIncluded(block, options.include ?? 'renderable', options.minCodeLines ?? 4)
    ) {
      lastEnd = block.endIndex;
    }
  }
  if (lastEnd === -1)
    return { before: removeArtifactBlocks(markdown, artifacts, options), after: '' };
  return {
    before: removeArtifactBlocks(markdown.slice(0, lastEnd), artifacts, options),
    after: markdown.slice(lastEnd).trim(),
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<SharedArtifact, 'content' | 'language'>>,
  options: ArtifactProseOptions = {},
): string {
  if (artifacts.length === 0) return markdown.trim();
  const wanted = new Set(artifacts.map((a) => normalizeWhitespace(a.content)));
  const blocks = extractCodeBlocks(markdown);
  let cleaned = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i]!;
    if (options.keepInline?.(block)) continue;
    if (
      wanted.has(normalizeWhitespace(block.content)) ||
      blockIncluded(block, options.include ?? 'renderable', options.minCodeLines ?? 4)
    ) {
      cleaned = cleaned.slice(0, block.startIndex) + cleaned.slice(block.endIndex);
    }
  }
  return cleaned.trim();
}
