import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { isEditableAssistantFenceLanguage } from './richBlocks';
import { parseCarousel, parseGallery } from './answerSurfaces';
import { markdownImageSource } from './markdownImageSources';

export interface AssistantFenceEdit {
  index: number;
  language: string;
  source: string;
  content: string;
}

interface FenceNode {
  type: string;
  lang?: string;
  value?: string;
  url?: string;
  identifier?: string;
  data?: { hProperties?: Record<string, unknown> };
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: FenceNode[];
}

const parser = unified().use(remarkParse);

function visitEditableFences(
  tree: FenceNode,
  visit: (node: FenceNode, index: number) => void,
): number {
  let index = 0;
  function walk(node: FenceNode): void {
    if (node.type === 'code' && isEditableAssistantFenceLanguage(node.lang?.toLowerCase() ?? '')) {
      visit(node, index);
      index += 1;
    }
    node.children?.forEach(walk);
  }
  walk(tree);
  return index;
}

export function remarkAssistantFenceIdentity() {
  return (tree: FenceNode) => {
    visitEditableFences(tree, (node, index) => {
      node.data ??= {};
      node.data.hProperties = { ...node.data.hProperties, dataAssistantFenceIndex: index };
    });
  };
}

export function countEditableAssistantFences(markdown: string): number {
  return visitEditableFences(parser.parse(markdown) as FenceNode, () => undefined);
}

export function imageResourceKey(source: string): string {
  return markdownImageSource(source)?.src.split('#', 1)[0] ?? '';
}

export function collectInlineImageSources(
  markdown: string,
  mode: 'all' | 'gallery' = 'all',
): ReadonlySet<string> {
  const tree = parser.parse(markdown) as FenceNode;
  const sources = new Set<string>();
  const definitions = new Map<string, string>();
  function walk(node: FenceNode, visit: (node: FenceNode) => void): void {
    visit(node);
    node.children?.forEach((child) => walk(child, visit));
  }
  walk(tree, (node) => {
    if (
      node.type === 'definition' &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier.toLowerCase())
    )
      definitions.set(node.identifier.toLowerCase(), node.url);
  });
  const add = (url: string) => {
    const key = imageResourceKey(url);
    if (key) sources.add(key);
  };
  walk(tree, (node) => {
    if (mode === 'all' && node.type === 'image' && node.url) add(node.url);
    if (mode === 'all' && node.type === 'imageReference' && node.identifier) {
      const url = definitions.get(node.identifier.toLowerCase());
      if (url) add(url);
    }
    if (node.type !== 'code') return;
    if (node.lang?.toLowerCase() === 'gallery')
      parseGallery(node.value ?? '').forEach((item) => add(item.src));
    if (node.lang?.toLowerCase() === 'carousel')
      parseCarousel(node.value ?? '')?.items.forEach((item) => add(item.src));
  });
  return sources;
}

export function applyAssistantFenceEdit(markdown: string, edit: AssistantFenceEdit): string | null {
  if (!Number.isSafeInteger(edit.index) || edit.index < 0) return null;
  let target: FenceNode | undefined;
  visitEditableFences(parser.parse(markdown) as FenceNode, (node, index) => {
    if (index === edit.index) target = node;
  });
  if (!target || target.lang?.toLowerCase() !== edit.language || target.value !== edit.source)
    return null;
  const start = target.position?.start.offset;
  const end = target.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  const original = markdown.slice(start, end);
  const opening = /^(`{3,}|~{3,})([^\r\n]*)/.exec(original);
  if (!opening?.[1]) return null;
  const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
  const prefix = markdown.slice(lineStart, start);
  if (!/^[ >\t]*$/.test(prefix)) return null;
  const marker = opening[1][0]!;
  const markerRun = marker === '`' ? /`+/g : /~+/g;
  let longest = 0;
  for (const match of edit.content.matchAll(markerRun))
    longest = Math.max(longest, match[0].length);
  const fence = marker.repeat(Math.max(opening[1].length, longest + 1));
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const body = edit.content.replace(/\r\n/g, '\n').split('\n').join(`${newline}${prefix}`);
  const replacement = `${fence}${opening[2]}${newline}${prefix}${body}${newline}${prefix}${fence}`;
  return markdown.slice(0, start) + replacement + markdown.slice(end);
}
