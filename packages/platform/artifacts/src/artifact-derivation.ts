import { v5 as uuidv5 } from 'uuid';
import type { SharedArtifact, SharedArtifactType } from '@agiworkforce/types';

export const DERIVED_ARTIFACT_NAMESPACE = '5f6c1e8a-2b3d-4c5e-8f9a-0b1c2d3e4f50';

export interface DerivedCodeBlock {
  language: string;
  content: string;
  startIndex: number;
  endIndex: number;
  ordinal: number;
  lineCount: number;
}

const FENCED_CODE_RE = /^```([^\n`]*)\r?\n([\s\S]*?)^```/gm;

function parseFenceLanguage(info: string | undefined): string {
  return (info ?? '').trim().split(/\s+/)[0]?.toLowerCase() || 'text';
}

export function extractCodeBlocks(markdown: string): DerivedCodeBlock[] {
  const blocks: DerivedCodeBlock[] = [];
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

export function extractArtifactTitle(content: string): string | undefined {
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
      text = text.replace(/<[^>]*>/g, '');
    } while (text !== prev);
    const trimmed = text.trim();
    if (trimmed) return trimmed;
  }

  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const cleaned = first
    .replace(/^#+\s+/, '')
    .replace(/^\/\/+\s*/, '')
    .trim();
  if (cleaned.length > 2 && cleaned.length <= MAX_TITLE_CHARS) return cleaned;

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

const OPEN_FENCE_RE = /^```([^\n`]*)\r?\n/m;

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

export type ArtifactInclusion = 'renderable' | 'code' | ((block: DerivedCodeBlock) => boolean);

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
  return isRenderableArtifact(block.language, block.content);
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

export function hasArtifacts(markdown: string, options: DeriveArtifactsOptions = {}): boolean {
  const { include = 'renderable', minCodeLines = 4 } = options;
  return extractCodeBlocks(markdown).some((b) => blockIncluded(b, include, minCodeLines));
}

export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<SharedArtifact, 'content' | 'language'>>,
): string {
  if (artifacts.length === 0) return markdown.trim();
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const wanted = new Set(artifacts.map((a) => norm(a.content)));
  const blocks = extractCodeBlocks(markdown);
  let cleaned = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i]!;
    if (wanted.has(norm(block.content)) || isRenderableArtifact(block.language, block.content)) {
      cleaned = cleaned.slice(0, block.startIndex) + cleaned.slice(block.endIndex);
    }
  }
  return cleaned.trim();
}
