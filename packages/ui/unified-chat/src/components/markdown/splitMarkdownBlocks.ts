import { unified } from 'unified';
import remarkParse from 'remark-parse';

import { REMARK_PLUGINS } from './remarkPlugins';

export const TAIL_NODE_RESERVE = 2;
const MIN_NODES_TO_SETTLE = TAIL_NODE_RESERVE + 1;
const LINE_FEED = '\n';
const HTML_NODE_TYPE = 'html';

const REFERENCE_DEFINITION_NODE_TYPES: ReadonlySet<string> = new Set([
  'definition',
  'footnoteDefinition',
]);

const VOID_HTML_TAGS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/;
const HTML_BOGUS_COMMENT_PATTERN = /<!(?!--)[^>]*>/;
const HTML_TAG_PATTERN =
  /<(?<closing>\/)?(?<name>[a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(?<selfClosing>\/)?>/;
const HTML_TOKEN_PATTERN = new RegExp(
  [HTML_COMMENT_PATTERN, HTML_BOGUS_COMMENT_PATTERN, HTML_TAG_PATTERN]
    .map((pattern) => pattern.source)
    .join('|'),
  'g',
);

const HASH_OFFSET_BASIS = 0x811c9dc5;
const HASH_PRIME = 0x01000193;
const HASH_RADIX = 36;

type HtmlTagTokenGroups = Partial<Record<'closing' | 'name' | 'selfClosing', string>>;

interface SourceSpan {
  readonly start: { readonly offset?: number | undefined };
  readonly end: { readonly offset?: number | undefined };
}

interface ParsedNode {
  readonly type: string;
  readonly value?: string | undefined;
  readonly children?: readonly ParsedNode[] | undefined;
  readonly position?: SourceSpan | undefined;
}

export interface SettledMarkdownBlock {
  readonly key: string;
  readonly source: string;
}

export interface MarkdownBlockSplit {
  readonly settled: readonly SettledMarkdownBlock[];
  readonly tail: string;
  readonly hasReferenceDefinition: boolean;
}

export interface MarkdownBlockSplitter {
  update(content: string): MarkdownBlockSplit;
  reset(): void;
}

const parseOnlyProcessor = unified().use(remarkParse).use(REMARK_PLUGINS).freeze();

const NO_SETTLED_BLOCKS: readonly SettledMarkdownBlock[] = Object.freeze([]);
const EMPTY_SPLIT: MarkdownBlockSplit = Object.freeze({
  settled: NO_SETTLED_BLOCKS,
  tail: '',
  hasReferenceDefinition: false,
});

function hashSource(source: string): string {
  let hash = HASH_OFFSET_BASIS;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, HASH_PRIME);
  }
  return (hash >>> 0).toString(HASH_RADIX);
}

function blockKey(index: number, source: string): string {
  return `${index}-${source.length.toString(HASH_RADIX)}-${hashSource(source)}`;
}

function collectRawHtml(node: ParsedNode, into: string[]): void {
  if (node.type === HTML_NODE_TYPE && typeof node.value === 'string') into.push(node.value);
  for (const child of node.children ?? []) collectRawHtml(child, into);
}

function htmlTagBalance(node: ParsedNode): number {
  const fragments: string[] = [];
  collectRawHtml(node, fragments);
  if (fragments.length === 0) return 0;

  let balance = 0;
  for (const token of fragments.join(LINE_FEED).matchAll(HTML_TOKEN_PATTERN)) {
    const { closing, name, selfClosing }: HtmlTagTokenGroups = token.groups ?? {};
    if (!name || selfClosing) continue;
    if (VOID_HTML_TAGS.has(name.toLowerCase())) continue;
    balance += closing ? -1 : 1;
  }
  return balance;
}

function lineStartBefore(source: string, offset: number): number {
  return source.lastIndexOf(LINE_FEED, offset - 1) + 1;
}

interface TailSettlement {
  readonly blocks: readonly string[];
  readonly consumed: number;
  readonly hasReferenceDefinition: boolean;
}

function settleFromTail(tail: string): TailSettlement {
  const root = parseOnlyProcessor.parse(tail) as unknown as {
    readonly children?: readonly ParsedNode[];
  };
  const nodes = root.children ?? [];
  const hasReferenceDefinition = nodes.some((node) =>
    REFERENCE_DEFINITION_NODE_TYPES.has(node.type),
  );
  if (nodes.length < MIN_NODES_TO_SETTLE) {
    return { blocks: [], consumed: 0, hasReferenceDefinition };
  }

  const blocks: string[] = [];
  let consumed = 0;
  let balance = 0;

  for (let index = 0; index < nodes.length - TAIL_NODE_RESERVE; index += 1) {
    const node = nodes[index];
    const next = nodes[index + 1];
    if (!node || !next) break;
    if (REFERENCE_DEFINITION_NODE_TYPES.has(node.type)) break;

    const nextStart = next.position?.start.offset;
    if (typeof nextStart !== 'number') break;

    balance += htmlTagBalance(node);
    if (balance !== 0) continue;

    const boundary = lineStartBefore(tail, nextStart);
    if (boundary <= consumed) continue;

    blocks.push(tail.slice(consumed, boundary));
    consumed = boundary;
  }

  return { blocks, consumed, hasReferenceDefinition };
}

export function createMarkdownBlockSplitter(): MarkdownBlockSplitter {
  let settled: readonly SettledMarkdownBlock[] = NO_SETTLED_BLOCKS;
  let settledSource = '';
  let lastContent = '';
  let lastSplit: MarkdownBlockSplit = EMPTY_SPLIT;

  function reset(): void {
    settled = NO_SETTLED_BLOCKS;
    settledSource = '';
    lastContent = '';
    lastSplit = EMPTY_SPLIT;
  }

  function update(content: string): MarkdownBlockSplit {
    if (content === lastContent) return lastSplit;
    if (!content.startsWith(settledSource)) reset();

    const { blocks, consumed, hasReferenceDefinition } = settleFromTail(
      content.slice(settledSource.length),
    );
    if (blocks.length > 0) {
      const grown = settled.slice();
      for (const source of blocks) {
        grown.push(Object.freeze({ key: blockKey(grown.length, source), source }));
      }
      settled = Object.freeze(grown);
      settledSource = content.slice(0, settledSource.length + consumed);
    }

    lastContent = content;
    lastSplit = Object.freeze({
      settled,
      tail: content.slice(settledSource.length),
      hasReferenceDefinition,
    });
    return lastSplit;
  }

  return { update, reset };
}
