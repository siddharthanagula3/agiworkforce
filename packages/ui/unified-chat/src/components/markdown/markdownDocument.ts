import { unified } from 'unified';
import remarkParse from 'remark-parse';

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

function plainText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

function inlinesOf(
  nodes: readonly MarkdownNode[] | undefined,
  marks: DocumentMarks,
): DocumentInline[] {
  const out: DocumentInline[] = [];
  for (const node of nodes ?? []) {
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
        if (HTML_LINE_BREAK.test(value.trim())) {
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

export function markdownToDocumentBlocks(source: string): DocumentBlock[] {
  const tree = documentProcessor.runSync(
    documentProcessor.parse(source),
  ) as unknown as MarkdownNode;
  const footnotes: DocumentBlock[] = [];
  const blocks = blocksOf(tree.children, footnotes);
  return footnotes.length > 0 ? [...blocks, { kind: 'rule' }, ...footnotes] : blocks;
}
