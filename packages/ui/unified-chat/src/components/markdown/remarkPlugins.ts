import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import type { Options } from 'react-markdown';
import { remarkAssistantFenceIdentity } from './assistantFenceEdits';

interface MarkdownAstNode {
  type: string;
  value?: string;
  lang?: string;
  align?: Array<string | null>;
  data?: { hProperties?: Record<string, unknown> };
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownAstNode[];
}

function remarkLosslessTables() {
  return (tree: MarkdownAstNode, file: { value: unknown }) => {
    if (typeof file.value !== 'string') return;
    const source = file.value;
    const pending = [tree];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === 'table') {
        const columns = node.children?.[0]?.children?.length;
        const overflow =
          columns !== undefined &&
          node.children?.some((row) => (row.children?.length ?? 0) > columns);
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (
          overflow &&
          typeof start === 'number' &&
          Number.isSafeInteger(start) &&
          start >= 0 &&
          typeof end === 'number' &&
          Number.isSafeInteger(end) &&
          end > start &&
          end <= source.length
        ) {
          node.type = 'code';
          node.lang = 'markdown';
          node.value = source.slice(start, end);
          node.data ??= {};
          node.data.hProperties = { ...node.data.hProperties, dataMarkdownSource: 'readonly' };
          delete node.children;
          delete node.align;
        }
      }
      for (const child of node.children ?? []) pending.push(child);
    }
  };
}

function remarkLiteralHtml() {
  return (tree: MarkdownAstNode) => {
    const pending = [tree];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) continue;
      if (node.type === 'html') node.type = 'text';
      if (node.children) pending.push(...node.children);
    }
  };
}

// Kept apart from MarkdownContent so splitMarkdownBlocks can share the exact
// plugin list without pulling the renderer - and with it every syntax grammar,
// KaTeX and the icon set - into a module that only needs to parse.
export const REMARK_PLUGINS = [
  remarkGfm,
  remarkMath,
  remarkBreaks,
  remarkLosslessTables,
  remarkAssistantFenceIdentity,
] satisfies Options['remarkPlugins'];

export const LITERAL_HTML_REMARK_PLUGINS = [
  ...REMARK_PLUGINS,
  remarkLiteralHtml,
] satisfies Options['remarkPlugins'];
