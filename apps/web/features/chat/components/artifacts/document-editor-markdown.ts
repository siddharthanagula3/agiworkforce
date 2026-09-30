import type { AnyExtension } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

export function documentEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: false } }),
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

const MATH_SPAN = /\$\$|\\\(|\\\[|(^|[^\\$])\$[^\s$][^$\n]*\$/m;
const SIGNATURE_KEYS = [
  'depth',
  'ordered',
  'start',
  'checked',
  'task',
  'lang',
  'href',
  'title',
  'align',
];

interface MarkdownToken {
  type: string;
  text?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  header?: { tokens: MarkdownToken[] }[];
  rows?: { tokens: MarkdownToken[] }[][];
  [key: string]: unknown;
}

interface TokenSignature {
  type: string;
  text?: string;
  children?: TokenSignature[];
  header?: TokenSignature[][];
  rows?: TokenSignature[][][];
  [key: string]: unknown;
}

function signature(tokens: readonly MarkdownToken[]): TokenSignature[] {
  const out: TokenSignature[] = [];
  for (const token of tokens) {
    if (token.type === 'space') continue;
    const entry: TokenSignature = { type: token.type === 'escape' ? 'text' : token.type };
    for (const key of SIGNATURE_KEYS) {
      const value = token[key];
      if (value !== undefined && value !== null && value !== '') entry[key] = value;
    }
    if (token.header) entry.header = token.header.map((cell) => signature(cell.tokens));
    if (token.rows) entry.rows = token.rows.map((row) => row.map((cell) => signature(cell.tokens)));
    if (token.items) entry.children = signature(token.items);
    else if (token.tokens?.length) entry.children = signature(token.tokens);
    else if (typeof token.text === 'string') entry.text = token.text.replace(/\s+/g, ' ').trim();
    const previous = out[out.length - 1];
    if (
      entry.type === 'text' &&
      previous?.type === 'text' &&
      !entry.children &&
      !previous.children
    ) {
      previous.text = `${previous.text ?? ''}${entry.text ?? ''}`;
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function createDocumentMarkdownManager(): MarkdownManager {
  return new MarkdownManager({ extensions: documentEditorExtensions() });
}

export function roundTripsAsDocument(markdown: string, manager: MarkdownManager): boolean {
  if (MATH_SPAN.test(markdown)) return false;
  try {
    const serialized = manager.serialize(manager.parse(markdown));
    const read = (source: string) =>
      JSON.stringify(signature(manager.instance.lexer(source) as unknown as MarkdownToken[]));
    return read(markdown) === read(serialized);
  } catch {
    return false;
  }
}
