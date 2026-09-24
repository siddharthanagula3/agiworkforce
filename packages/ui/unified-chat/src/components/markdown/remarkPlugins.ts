import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import type { Options } from 'react-markdown';

interface MarkdownAstNode {
  type: string;
  children?: MarkdownAstNode[];
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
] satisfies Options['remarkPlugins'];

export const LITERAL_HTML_REMARK_PLUGINS = [
  ...REMARK_PLUGINS,
  remarkLiteralHtml,
] satisfies Options['remarkPlugins'];
