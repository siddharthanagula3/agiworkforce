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
 *     The forked web copy used `Date.now()` + `crypto.randomUUID()` — a fresh id
 *     on every render, which is precisely why derived artifacts could not be
 *     de-duplicated or cloud-synced across devices. This module fixes that
 *     (see docs/plans/artifact-cloud-sync-design-2026-06-21.md §4 and
 *     docs/plans/shared-packages-consolidation-plan-2026-06-21.md §3).
 *
 *  2. PLATFORM-AGNOSTIC OUTPUT. Returns `SharedArtifact` (from
 *     `@agiworkforce/types`), which each surface maps to its own view type
 *     (web `ArtifactData`, mobile `MobileArtifact`). No DOM, no RN — safe to
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

/**
 * Fixed namespace for deterministic derived-artifact ids. NEVER change this —
 * changing it re-keys every derived artifact and breaks cross-device de-dup.
 */
export const DERIVED_ARTIFACT_NAMESPACE = '5f6c1e8a-2b3d-4c5e-8f9a-0b1c2d3e4f50';

/** A fenced code block located in message markdown. */
export interface DerivedCodeBlock {
  /** Fence language tag (e.g. `html`, `python`) or `''` when absent. */
  language: string;
  /** Block body, trimmed. */
  content: string;
  /** Character offset of the block start in the source markdown. */
  startIndex: number;
  /** Character offset just past the block end. */
  endIndex: number;
  /** 0-based position of this block within the message (the de-dup ordinal). */
  ordinal: number;
  /** Count of non-empty lines in `content`. */
  lineCount: number;
}

/**
 * Matches a fenced code block: ```info\n...\n```. The info string is optional.
 *
 * AUDIT-FIX ART-2: the info string is `[^\n`]*` (not `\w*`) and BOTH fences are
 * anchored to a line start via the `m` flag. The old `\w*\n` form matched no
 * opening fence that carried attributes (```html title="x"), a hyphen or dot in
 * the tag (```objective-c) or a CRLF line ending. The scan then resumed at that
 * block's CLOSING fence and paired it AS AN OPENING one, so every later
 * `ordinal`, `startIndex` and `endIndex` in the message was wrong — which
 * spliced the wrong ranges out of the transcript, reported phantom open fences
 * to the streaming parser, and broke the streaming -> persisted id handoff.
 */
const FENCED_CODE_RE = /^```([^\n`]*)\r?\n([\s\S]*?)^```/gm;

/**
 * The fence info string is not just a language: it can carry attributes
 * (```html title="x"). AUDIT-FIX ART-2: take only the leading whitespace-
 * delimited token and lowercase it, so downstream language comparisons
 * (`isRenderableArtifact`, `detectArtifactType`) still match.
 */
function parseFenceLanguage(info: string | undefined): string {
  return (info ?? '').trim().split(/\s+/)[0]?.toLowerCase() || 'text';
}

/**
 * Extract every fenced code block from markdown, in document order, each tagged
 * with its `ordinal` (used for the deterministic id) and `lineCount`.
 */
export function extractCodeBlocks(markdown: string): DerivedCodeBlock[] {
  const blocks: DerivedCodeBlock[] = [];
  // Local regex instance — never share lastIndex across calls.
  const re = new RegExp(FENCED_CODE_RE.source, FENCED_CODE_RE.flags);
  let match: RegExpExecArray | null;
  let ordinal = 0;
  while ((match = re.exec(markdown)) !== null) {
    const content = (match[2] ?? '').trim();
    blocks.push({
      language: parseFenceLanguage(match[1]),
      content,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      ordinal,
      lineCount: content.split('\n').filter((l) => l.trim().length > 0).length,
    });
    ordinal += 1;
  }
  return blocks;
}

/**
 * Whether a block should render as a live/interactive artifact (web policy):
 * html/react/svg/mermaid, HTML-like content, or an explicit `@artifact` marker.
 */
export function isRenderableArtifact(language: string, content: string): boolean {
  const lang = language.toLowerCase();
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

/** Detect the artifact category from a block's language + content. */
export function detectArtifactType(language: string, content: string): SharedArtifactType {
  const lang = language.toLowerCase();
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

/**
 * `@title:` marker in a leading comment, terminated by a newline or `-->`.
 *
 * Replaces `/(?:\/\/|<!--|#)\s*@title:?\s*(.+?)(?:\n|-->)/i`, whose `(.+?)`
 * before an alternation of terminators is the same quadratic shape as the tag
 * spans above when NEITHER terminator appears.
 */
function extractTitleComment(content: string): string | undefined {
  const marker = /(?:\/\/|<!--|#)\s*@title:?\s*/i.exec(content);
  if (!marker) return undefined;
  const start = marker.index + marker[0].length;
  const newline = content.indexOf('\n', start);
  const commentEnd = content.indexOf('-->', start);
  const candidates = [newline, commentEnd].filter((i) => i !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : content.length;
  const value = content.slice(start, end).trim();
  return value || undefined;
}

/**
 * Derive a human-readable title: an explicit `<title>`/`@title`, an `<h1>`, or
 * the first meaningful line (comment/heading stripped); else undefined.
 */
/**
 * Text between an opening tag and its closing tag, found by scanning rather
 * than by a lazy quantifier.
 *
 * `/<title>(.*?)<\/title>/` and friends are quadratic when the CLOSING tag is
 * absent: the engine advances `.*?` one character at a time and retries the
 * whole tail at each position (js/polynomial-redos). Artifact content is
 * model-generated and can be large, and an unterminated tag is exactly what a
 * truncated stream produces — so the pathological input is the ordinary
 * failure case here, not a crafted attack.
 *
 * `indexOf` does the same job in one forward pass and returns undefined when
 * the closer is missing, which is the behaviour the callers already expected.
 */
function betweenTags(content: string, openPattern: RegExp, closeTag: string): string | undefined {
  const open = openPattern.exec(content);
  if (!open) return undefined;
  const start = open.index + open[0].length;
  const end = content.toLowerCase().indexOf(closeTag, start);
  return end === -1 ? undefined : content.slice(start, end);
}

export function extractArtifactTitle(content: string): string | undefined {
  // `<title>` and `<h1 ...>` are linear on their own — a negated class before a
  // required literal does not backtrack. Only the span between them was.
  const titleText = betweenTags(content, /<title\s*>/i, '</title>');
  if (titleText?.trim()) return titleText.trim();

  const commentText = extractTitleComment(content);
  if (commentText) return commentText;

  const headingText = betweenTags(content, /<h1[^>]*>/i, '</h1>');
  if (headingText) {
    let text: string = headingText;
    let prev: string;
    do {
      prev = text;
      text = text.replace(/<[^>]*>/g, '');
    } while (text !== prev);
    const trimmed = text.trim();
    if (trimmed) return trimmed;
  }

  // First meaningful line, comment/heading markers stripped (mobile policy).
  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const cleaned = first
    .replace(/^#+\s+/, '')
    .replace(/^\/\/+\s*/, '')
    .trim();
  if (cleaned.length > 2 && cleaned.length <= MAX_TITLE_CHARS) return cleaned;

  return undefined;
}

/**
 * The deterministic, cross-surface-stable id for a derived artifact.
 *
 * Keyed on `conversationId:messageId:ordinal` so every surface (and a re-render)
 * computes the SAME id, and an edited artifact (which keeps this id) overlays the
 * exact derived artifact it came from. This is the de-dup / cloud-sync key.
 */
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

/**
 * A trailing, still-open fenced code block found at the end of a streaming
 * message buffer (opening ``` fence seen, closing fence not yet arrived).
 */
export interface TrailingUnclosedBlock {
  /** Fence language tag (e.g. `html`) or `'text'` when absent. */
  language: string;
  /** Partial block body streamed so far (NOT trimmed — it is still growing). */
  content: string;
  /**
   * The ordinal this block WILL have once the fence closes (= count of
   * complete blocks before it). Feeding this to
   * {@link computeDerivedArtifactId} yields the SAME id the completed
   * artifact will get, enabling a seamless streaming → persisted handoff.
   */
  ordinal: number;
  /** Character offset of the opening ``` in the source markdown. */
  startIndex: number;
}

/**
 * Matches the opening fence of a code block whose language-tag line is
 * COMPLETE (terminated by a newline). While streaming, a partial "```ht"
 * without its newline must NOT match — the language tag may still be growing.
 */
// AUDIT-FIX ART-2: mirrors FENCED_CODE_RE — line-anchored, permissive info
// string, CRLF tolerant. Anything narrower would miss the same opening fences
// the canonical extractor now sees, desynchronising the streamed ordinal from
// the one the completed artifact gets.
const OPEN_FENCE_RE = /^```([^\n`]*)\r?\n/m;

/**
 * Incremental-parse helper for live streaming: find the trailing UNCLOSED
 * fenced code block at the end of a partial markdown buffer, if any.
 *
 * Only the text AFTER the last complete fenced block is scanned, so
 * fence-like text inside earlier (closed) code blocks can never be
 * misdetected as an opening fence. Returns null when:
 *  - there is no open fence in the tail;
 *  - an open fence exists but its language-tag line is not yet complete
 *    (no newline after ```lang — the tag may still be streaming in).
 *
 * Pure string/regex slicing — safe for pathological inputs (giant single
 * lines, repeated backticks) with linear cost.
 */
export function extractTrailingUnclosedBlock(markdown: string): TrailingUnclosedBlock | null {
  const blocks = extractCodeBlocks(markdown);
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

/** How a markdown message is turned into artifacts. */
export type ArtifactInclusion = 'renderable' | 'code' | ((block: DerivedCodeBlock) => boolean);

export interface DeriveArtifactsOptions {
  /** Owning conversation id — part of the deterministic id. */
  conversationId?: string;
  /** Owning message id — part of the deterministic id. */
  messageId?: string;
  /**
   * Which blocks become artifacts:
   *  - `'renderable'` (default, web): only live-renderable artifacts.
   *  - `'code'` (mobile gallery): every code block with >= `minCodeLines` lines.
   *  - a predicate for custom policies.
   */
  include?: ArtifactInclusion;
  /** Minimum non-empty lines for `include: 'code'`. Default 4 (mobile). */
  minCodeLines?: number;
  /** ISO timestamp stamped as `createdAt`/`updatedAt`. Defaults to now. */
  now?: string;
}

function blockIncluded(
  block: DerivedCodeBlock,
  include: ArtifactInclusion,
  minCodeLines: number,
): boolean {
  if (typeof include === 'function') return include(block);
  if (include === 'code') return block.lineCount >= minCodeLines;
  // 'renderable'
  return isRenderableArtifact(block.language, block.content);
}

/**
 * Derive `SharedArtifact`s from a markdown message. Deterministic ids; pure
 * except for the `now` timestamp (pass `now` for fully reproducible output).
 */
export function deriveArtifacts(
  markdown: string,
  options: DeriveArtifactsOptions = {},
): SharedArtifact[] {
  const { conversationId, messageId, include = 'renderable', minCodeLines = 4 } = options;
  const now = options.now ?? new Date().toISOString();

  const artifacts: SharedArtifact[] = [];
  for (const block of extractCodeBlocks(markdown)) {
    if (!blockIncluded(block, include, minCodeLines)) continue;
    artifacts.push({
      id: computeDerivedArtifactId(conversationId, messageId, block.ordinal),
      type: detectArtifactType(block.language, block.content),
      title: extractArtifactTitle(block.content) ?? defaultTitle(block),
      content: block.content,
      language: block.language,
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

function defaultTitle(block: DerivedCodeBlock): string {
  const lang =
    block.language && block.language !== 'text' ? `${block.language} snippet` : 'Code snippet';
  return block.ordinal === 0 ? lang : `${lang} ${block.ordinal + 1}`;
}

/** True when the message contains at least one block matching the policy. */
export function hasArtifacts(markdown: string, options: DeriveArtifactsOptions = {}): boolean {
  const { include = 'renderable', minCodeLines = 4 } = options;
  return extractCodeBlocks(markdown).some((b) => blockIncluded(b, include, minCodeLines));
}

/**
 * Strip the derived artifacts' code blocks from markdown so the chat body does
 * not duplicate what the artifact panel shows.
 */
export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<SharedArtifact, 'content' | 'language'>>,
): string {
  if (artifacts.length === 0) return markdown.trim();
  // Strip the message's own fenced blocks that were surfaced as artifact cards, matching on
  // the CURRENT markdown's block RANGES (extractCodeBlocks gives exact start/end) — NOT a
  // regex built from the passed artifact `content`. The passed content can drift from the
  // final markdown (e.g. an artifact captured mid-stream and cached in the store, or trimmed
  // differently), which made the old exact-content regex miss and left a DUPLICATE raw code
  // block sitting next to the rendered card. Position-based removal cannot drift. A block is
  // stripped when its whitespace-normalized content matches a passed artifact's, OR when it
  // is itself a renderable artifact (the web inclusion policy that produced the card).
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const wanted = new Set(artifacts.map((a) => norm(a.content)));
  const blocks = extractCodeBlocks(markdown);
  let cleaned = markdown;
  // Remove right-to-left so earlier startIndex offsets stay valid as we splice.
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i]!;
    if (wanted.has(norm(block.content)) || isRenderableArtifact(block.language, block.content)) {
      cleaned = cleaned.slice(0, block.startIndex) + cleaned.slice(block.endIndex);
    }
  }
  return cleaned.trim();
}
