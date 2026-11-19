import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { normalizeMathDelimiters, tagsAndDollarsAsText } from '@agiworkforce/utils/markdown-source';

import { REMARK_PLUGINS } from './remarkPlugins';

export interface DocumentMarks {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strike?: boolean;
  readonly code?: boolean;
  readonly href?: string;
}

export type DocumentInline =
  | { readonly kind: 'text'; readonly text: string; readonly marks: DocumentMarks }
  | { readonly kind: 'math'; readonly tex: string }
  | { readonly kind: 'break' };

export type DocumentAlign = 'left' | 'center' | 'right' | null;

export interface DocumentListItem {
  readonly checked: boolean | null;
  readonly blocks: readonly DocumentBlock[];
}

export type DocumentTableRow = readonly (readonly DocumentInline[])[];

export type DocumentBlock =
  | {
      readonly kind: 'heading';
      readonly level: number;
      readonly inlines: readonly DocumentInline[];
    }
  | { readonly kind: 'paragraph'; readonly inlines: readonly DocumentInline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly DocumentListItem[];
    }
  | { readonly kind: 'code'; readonly language: string; readonly text: string }
  | { readonly kind: 'quote'; readonly blocks: readonly DocumentBlock[] }
  | {
      readonly kind: 'table';
      readonly align: readonly DocumentAlign[];
      readonly rows: readonly DocumentTableRow[];
    }
  | { readonly kind: 'math'; readonly tex: string }
  | { readonly kind: 'rule' };

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly depth?: number;
  readonly ordered?: boolean | null;
  readonly start?: number | null;
  readonly checked?: boolean | null;
  readonly lang?: string | null;
  readonly url?: string;
  readonly alt?: string | null;
  readonly label?: string | null;
  readonly identifier?: string;
  readonly align?: readonly DocumentAlign[] | null;
  readonly children?: readonly MarkdownNode[];
}

const documentProcessor = unified().use(remarkParse).use(REMARK_PLUGINS).freeze();

const EXPORTABLE_HREF = /^(https?:|mailto:)/i;
const HTML_TAG = /<[^>]*>/g;
const HTML_LINE_BREAK = /^<br\s*\/?>$/i;
const NO_MARKS: DocumentMarks = {};

function exportableHref(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed && EXPORTABLE_HREF.test(trimmed) ? trimmed : undefined;
}

const OPEN_TAG = /^<([A-Za-z][A-Za-z0-9-]*)(\s[^<>]*)?>$/;
const CLOSE_TAG = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/;
const LINE_BREAK_ELEMENTS: ReadonlySet<string> = new Set(['br', 'wbr']);
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
]);

// A tag named in a sentence ("use the <script> tag") is text the reader was
// shown, not markup: a bare void tag, or a bare opening tag nothing closes.
// A tag with attributes, a closing tag and a closed pair stay markup.
function tagMentions(nodes: readonly MarkdownNode[]): ReadonlySet<number> {
  const mentions = new Set<number>();
  const unclosed = new Map<string, { index: number; bare: boolean }[]>();
  nodes.forEach((node, index) => {
    if (node.type !== 'html') return;
    const value = (node.value ?? '').trim();
    const opening = OPEN_TAG.exec(value);
    if (opening) {
      const name = opening[1]!.toLowerCase();
      const bare = opening[2] === undefined;
      if (LINE_BREAK_ELEMENTS.has(name)) return;
      if (VOID_ELEMENTS.has(name)) {
        if (bare) mentions.add(index);
        return;
      }
      unclosed.set(name, [...(unclosed.get(name) ?? []), { index, bare }]);
      return;
    }
    const closing = CLOSE_TAG.exec(value);
    if (closing) unclosed.get(closing[1]!.toLowerCase())?.pop();
  });
  for (const opened of unclosed.values()) {
    for (const { index, bare } of opened) if (bare) mentions.add(index);
  }
  return mentions;
}

function plainText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

function inlinesOf(
  nodes: readonly MarkdownNode[] | undefined,
  marks: DocumentMarks,
): DocumentInline[] {
  const out: DocumentInline[] = [];
  const mentions = tagMentions(nodes ?? []);
  for (const [index, node] of (nodes ?? []).entries()) {
    switch (node.type) {
      case 'text':
        if (node.value) out.push({ kind: 'text', text: node.value, marks });
        break;
      case 'strong':
        out.push(...inlinesOf(node.children, { ...marks, bold: true }));
        break;
      case 'emphasis':
        out.push(...inlinesOf(node.children, { ...marks, italic: true }));
        break;
      case 'delete':
        out.push(...inlinesOf(node.children, { ...marks, strike: true }));
        break;
      case 'inlineCode':
        if (node.value)
          out.push({ kind: 'text', text: node.value, marks: { ...marks, code: true } });
        break;
      case 'inlineMath':
        if (node.value) out.push({ kind: 'math', tex: node.value });
        break;
      case 'break':
        out.push({ kind: 'break' });
        break;
      case 'link': {
        const href = exportableHref(node.url);
        out.push(...inlinesOf(node.children, href ? { ...marks, href } : marks));
        break;
      }
      case 'image': {
        const href = exportableHref(node.url);
        const text = node.alt?.trim() || href || '';
        if (text) out.push({ kind: 'text', text, marks: href ? { ...marks, href } : marks });
        break;
      }
      case 'footnoteReference':
        out.push({ kind: 'text', text: `[${node.label ?? node.identifier ?? ''}]`, marks });
        break;
      case 'html': {
        const value = node.value ?? '';
        if (mentions.has(index)) {
          out.push({ kind: 'text', text: value, marks });
        } else if (HTML_LINE_BREAK.test(value.trim())) {
          out.push({ kind: 'break' });
        } else {
          const text = value.replace(HTML_TAG, '');
          if (text) out.push({ kind: 'text', text, marks });
        }
        break;
      }
      default:
        out.push(...inlinesOf(node.children, marks));
    }
  }
  return out;
}

function blocksOf(
  nodes: readonly MarkdownNode[] | undefined,
  footnotes: DocumentBlock[],
): DocumentBlock[] {
  const out: DocumentBlock[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'heading':
        out.push({
          kind: 'heading',
          level: node.depth ?? 1,
          inlines: inlinesOf(node.children, NO_MARKS),
        });
        break;
      case 'paragraph': {
        const inlines = inlinesOf(node.children, NO_MARKS);
        if (inlines.length > 0) out.push({ kind: 'paragraph', inlines });
        break;
      }
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocksOf(node.children, footnotes) });
        break;
      case 'list':
        out.push({
          kind: 'list',
          ordered: Boolean(node.ordered),
          start: node.start ?? 1,
          items: (node.children ?? []).map((item) => ({
            checked: typeof item.checked === 'boolean' ? item.checked : null,
            blocks: blocksOf(item.children, footnotes),
          })),
        });
        break;
      case 'code':
        out.push({ kind: 'code', language: node.lang ?? '', text: node.value ?? '' });
        break;
      case 'math':
        if (node.value?.trim()) out.push({ kind: 'math', tex: node.value });
        break;
      case 'thematicBreak':
        out.push({ kind: 'rule' });
        break;
      case 'table':
        out.push({
          kind: 'table',
          align: node.align ?? [],
          rows: (node.children ?? []).map((row) =>
            (row.children ?? []).map((cell) => inlinesOf(cell.children, NO_MARKS)),
          ),
        });
        break;
      case 'html': {
        const text = (node.value ?? '').replace(HTML_TAG, '').trim();
        if (text)
          out.push({ kind: 'paragraph', inlines: [{ kind: 'text', text, marks: NO_MARKS }] });
        break;
      }
      case 'footnoteDefinition': {
        const label = `[${node.label ?? node.identifier ?? ''}] `;
        const [first, ...rest] = blocksOf(node.children, footnotes);
        const lead: DocumentInline = { kind: 'text', text: label, marks: NO_MARKS };
        footnotes.push(
          first?.kind === 'paragraph'
            ? { kind: 'paragraph', inlines: [lead, ...first.inlines] }
            : { kind: 'paragraph', inlines: [lead] },
          ...(first && first.kind !== 'paragraph' ? [first] : []),
          ...rest,
        );
        break;
      }
      case 'definition':
        break;
      default:
        if (node.children) {
          out.push(...blocksOf(node.children, footnotes));
        } else if (node.value?.trim()) {
          out.push({
            kind: 'paragraph',
            inlines: [{ kind: 'text', text: plainText(node), marks: NO_MARKS }],
          });
        }
    }
  }
  return out;
}

function collectDefinitions(node: MarkdownNode, into: Map<string, string>): void {
  if (node.type === 'definition' && node.identifier && node.url !== undefined) {
    if (!into.has(node.identifier)) into.set(node.identifier, node.url);
  }
  for (const child of node.children ?? []) collectDefinitions(child, into);
}

function resolveReferences(
  node: MarkdownNode,
  definitions: ReadonlyMap<string, string>,
): MarkdownNode {
  const children = node.children?.map((child) => resolveReferences(child, definitions));
  const url = node.identifier ? definitions.get(node.identifier) : undefined;
  if (node.type === 'linkReference') return { ...node, type: 'link', url, children };
  if (node.type === 'imageReference') return { ...node, type: 'image', url };
  return children ? { ...node, children } : node;
}

export function markdownToDocumentBlocks(source: string): DocumentBlock[] {
  const parsed = documentProcessor.runSync(
    documentProcessor.parse(source),
  ) as unknown as MarkdownNode;
  const definitions = new Map<string, string>();
  collectDefinitions(parsed, definitions);
  const tree = resolveReferences(parsed, definitions);
  const footnotes: DocumentBlock[] = [];
  const blocks = blocksOf(tree.children, footnotes);
  return footnotes.length > 0 ? [...blocks, { kind: 'rule' }, ...footnotes] : blocks;
}

const BLOCK_TEXT_SEPARATOR = '\n';

function inlinesRenderedText(inlines: readonly DocumentInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.kind === 'text') return inline.text;
      if (inline.kind === 'break') return '\n';
      return inline.kind === 'math' ? inline.tex : '';
    })
    .join('');
}

function blockRenderedText(block: DocumentBlock): string[] {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return [inlinesRenderedText(block.inlines)];
    case 'list':
      return block.items.flatMap((item) => item.blocks.flatMap(blockRenderedText));
    case 'quote':
      return block.blocks.flatMap(blockRenderedText);
    case 'table':
      return block.rows.flatMap((row) => row.map(inlinesRenderedText));
    case 'code':
      return [block.text];
    case 'math':
      return [block.tex];
    case 'rule':
      return [];
  }
}

export function markdownRenderedText(source: string): string {
  return markdownToDocumentBlocks(source)
    .flatMap(blockRenderedText)
    .filter((text) => text !== '')
    .join(BLOCK_TEXT_SEPARATOR);
}

/**
 * One line of what a short piece of model-written Markdown reads as, for text
 * that is shown and sent as typed words, such as a follow-up suggestion.
 */
export function markdownLineText(source: string): string {
  return markdownRenderedText(normalizeMathDelimiters(tagsAndDollarsAsText(source)))
    .replace(/\s+/g, ' ')
    .trim();
}
